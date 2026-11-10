# Order of steps
[ ] 1. Record the demo GIF/video (01-demo-video.md), save docs/demo.gif, un-comment it in README.md, push.
[ ] 2. Check the release has HALO-Setup.exe AND latest.yml (needed for auto-update). Test-install on a clean Windows user/VM.
[ ] 3. Scan HALO-Setup.exe on virustotal.com and put the result link in the release notes. (A few "false positive" hits are common for unsigned Electron apps.)
[ ] 4. In the repo: Settings -> General: tick "Issues" (and Discussions if you want); upload a Social preview image (1280x640 PNG).
[ ] 5. Decide the licence (see note below).
[ ] 6. Post: Persian channels first (friendly, quick feedback), then Reddit, then Show HN / Product Hunt after you've fixed the first bugs.
[ ] 7. Answer every comment/issue within a day for the first week - this is what makes people trust and star the project.
[ ] 8. After 1-2 stable versions: submit the winget manifest (winget/ folder).

# Licence note
The project currently says "Copyright (c) hworks. All rights reserved." / package.json "UNLICENSED". With a public repo this means other people may look at the code but may not legally reuse or redistribute it. If you want people to contribute/share it, choose a licence deliberately (MIT is the most permissive; GPL-3.0 requires derivative works to stay open; or keep "all rights reserved"). It's your decision - I did not change it.

# Avoid
- Posting the same text in many subreddits at once, or asking for upvotes (gets you banned).
- Promising features you haven't built.
- Claiming it's "100% safe"; say what it reads and link the source.
