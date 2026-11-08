# HALO - made by hworks (ecchworks@gmail.com)
# Fallback notification reader that needs NO setup: reads Windows' own notification database
# (copy of wpndatabase.db) with the sqlite that ships inside Windows (winsqlite3.dll).
param([int]$ParentPid = 0)
$utf8 = New-Object System.Text.UTF8Encoding $false
$out = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $utf8)
$out.AutoFlush = $true
function Emit($o) { $out.WriteLine(($o | ConvertTo-Json -Compress -Depth 4)) }
$ErrorActionPreference = 'Stop'
Emit @{ type = 'hello'; script = 'notif-db'; ps = $PSVersionTable.PSVersion.ToString() }

try {
  Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class HaloSqlite {
  const string DLL = "winsqlite3.dll";
  [DllImport(DLL, CallingConvention = CallingConvention.Cdecl)] static extern int sqlite3_open_v2(byte[] filename, out IntPtr db, int flags, IntPtr vfs);
  [DllImport(DLL, CallingConvention = CallingConvention.Cdecl)] static extern int sqlite3_close(IntPtr db);
  [DllImport(DLL, CallingConvention = CallingConvention.Cdecl)] static extern int sqlite3_prepare_v2(IntPtr db, byte[] sql, int nByte, out IntPtr stmt, IntPtr tail);
  [DllImport(DLL, CallingConvention = CallingConvention.Cdecl)] static extern int sqlite3_step(IntPtr stmt);
  [DllImport(DLL, CallingConvention = CallingConvention.Cdecl)] static extern int sqlite3_finalize(IntPtr stmt);
  [DllImport(DLL, CallingConvention = CallingConvention.Cdecl)] static extern IntPtr sqlite3_column_blob(IntPtr stmt, int col);
  [DllImport(DLL, CallingConvention = CallingConvention.Cdecl)] static extern int sqlite3_column_bytes(IntPtr stmt, int col);
  static byte[] Z(string s) { byte[] b = Encoding.UTF8.GetBytes(s); byte[] r = new byte[b.Length + 1]; Array.Copy(b, r, b.Length); return r; }
  static string Col(IntPtr st, int i) {
    IntPtr p = sqlite3_column_blob(st, i); int n = sqlite3_column_bytes(st, i);
    if (p == IntPtr.Zero || n <= 0) return "";
    byte[] b = new byte[n]; Marshal.Copy(p, b, 0, n); return Encoding.UTF8.GetString(b);
  }
  public static List<string[]> Query(string path, string sql, int cols) {
    List<string[]> rows = new List<string[]>(); IntPtr db;
    int rc = sqlite3_open_v2(Z(path), out db, 2, IntPtr.Zero);
    if (rc != 0) { sqlite3_close(db); throw new Exception("sqlite open failed rc=" + rc); }
    try {
      IntPtr st; rc = sqlite3_prepare_v2(db, Z(sql), -1, out st, IntPtr.Zero);
      if (rc != 0) throw new Exception("sqlite prepare failed rc=" + rc);
      try { while (sqlite3_step(st) == 100) { string[] r = new string[cols]; for (int i = 0; i < cols; i++) r[i] = Col(st, i); rows.Add(r); } }
      finally { sqlite3_finalize(st); }
    } finally { sqlite3_close(db); }
    return rows;
  }
}
"@

  $srcDir = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Notifications'
  $srcDb = Join-Path $srcDir 'wpndatabase.db'
  $srcWal = Join-Path $srcDir 'wpndatabase.db-wal'
  $tmpDir = Join-Path $env:TEMP 'halo-wpn'
  New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
  $tmpDb = Join-Path $tmpDir 'copy.db'
  $tmpWal = Join-Path $tmpDir 'copy.db-wal'
  $tmpShm = Join-Path $tmpDir 'copy.db-shm'
  if (-not (Test-Path $srcDb)) { throw "Notification database not found: $srcDb" }

  function Copy-Shared($from, $to) {
    $in = New-Object System.IO.FileStream($from, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]'ReadWrite,Delete'))
    try { $o = [IO.File]::Create($to); try { $in.CopyTo($o) } finally { $o.Dispose() } } finally { $in.Dispose() }
  }
  function Clean-App($id) {
    $a = [string]$id
    if ($a -match '(?i)telegram') { return 'Telegram' }
    if ($a -match '(?i)whatsapp') { return 'WhatsApp' }
    if ($a -match '(?i)discord') { return 'Discord' }
    if ($a -match '(?i)instagram') { return 'Instagram' }
    if ($a -match '(?i)chrome') { return 'Chrome' }
    if ($a -match '(?i)msedge|edge') { return 'Edge' }
    if ($a -match '(?i)outlook') { return 'Outlook' }
    if ($a -match '(?i)teams') { return 'Teams' }
    $a = ($a -split '!')[0]
    $parts = $a -split '[._\\/]'
    $last = $parts[$parts.Count - 1]
    if ($last) { return $last } else { return $a }
  }

  $sql = "SELECT n.Id, n.Payload, COALESCE(h.PrimaryId, '') FROM Notification n LEFT JOIN NotificationHandler h ON h.RecordId = n.HandlerId WHERE n.Type = 'toast'"
  $seen = @{}
  $first = $true
  $lastSig = ''
  $okSent = $false
  $fails = 0

  while ($true) {
    if ($ParentPid -gt 0 -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit 0 }
    try {
      $dbi = Get-Item $srcDb
      $sig = [string]$dbi.LastWriteTimeUtc.Ticks
      if (Test-Path $srcWal) { $w = Get-Item $srcWal; $sig += '-' + $w.Length + '-' + $w.LastWriteTimeUtc.Ticks }
      if ($sig -ne $lastSig) {
        Remove-Item $tmpShm -Force -ErrorAction SilentlyContinue
        Copy-Shared $srcDb $tmpDb
        if (Test-Path $srcWal) { Copy-Shared $srcWal $tmpWal } else { Remove-Item $tmpWal -Force -ErrorAction SilentlyContinue }
        $rows = [HaloSqlite]::Query($tmpDb, $sql, 3)
        $now = @{}
        foreach ($r in $rows) {
          $id = [string]$r[0]
          $now[$id] = 1
          if (-not $first -and -not $seen.ContainsKey($id)) {
            $title = ''; $body = ''; $launch = ''; $texts = @()
            try {
              $x = New-Object System.Xml.XmlDocument
              $x.LoadXml(([string]$r[1]).Trim([char]0xFEFF, [char]0))
              $texts = @($x.SelectNodes('//text') | ForEach-Object { $_.InnerText })
              $launch = [string]$x.DocumentElement.GetAttribute('launch')
              if ($launch.Length -gt 300) { $launch = $launch.Substring(0, 300) }
              if ($texts.Count -gt 0) { $title = [string]$texts[0] }
              if ($texts.Count -gt 1) { $body = ($texts[1..($texts.Count - 1)] -join "`n") }
            } catch {}
            if ($title -or $body) { Emit @{ type = 'toast'; id = $id; app = (Clean-App $r[2]); aumid = [string]$r[2]; title = $title; body = $body; launch = $launch; origin = $(if ($texts.Count -gt 1) { [string]$texts[$texts.Count - 1] } else { '' }); lines = @($texts | ForEach-Object { [string]$_ }) } }
          }
        }
        $seen = $now
        $first = $false
        $lastSig = $sig
        if (-not $okSent) { Emit @{ type = 'status'; mode = 'db'; access = 'Allowed'; rows = $rows.Count }; $okSent = $true }
      }
      $fails = 0
    } catch {
      $fails++
      Emit @{ type = 'error'; message = [string]$_.Exception.Message }
      if ($fails -ge 6) { Emit @{ type = 'fatal'; message = [string]$_.Exception.Message }; exit 1 }
      Start-Sleep -Seconds 2
    }
    Start-Sleep -Milliseconds 1200
  }
} catch {
  Emit @{ type = 'fatal'; message = [string]$_.Exception.Message }
  exit 1
}
