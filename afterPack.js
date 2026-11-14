// HALO - made by hworks (ecchworks@gmail.com)
// Runs after packing: embeds the HALO icon into the .exe without electron-builder signing tools.
// Puts our icon on the app .exe (needed for the desktop shortcut icon) without
// electron-builder's winCodeSign tool, which fails without symlink privileges.
const path = require('path');
module.exports = async function (context) {
  if (context.electronPlatformName !== 'win32') return;
  const exe = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.exe');
  const icon = path.join(context.packager.projectDir, 'build', 'icon.ico');
  try {
    const mod = await import('rcedit');
    const rcedit = mod.rcedit || mod.default || mod;
    await rcedit(exe, { icon });
    console.log('  • icon embedded into', path.basename(exe));
  } catch (e) {
    console.warn('  • could not embed icon (continuing):', e.message);
  }
};
