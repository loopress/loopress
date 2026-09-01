# Terminal half of the apps screencast. Render with:
#
#   eval "$(WP_URL=... WP_USERNAME=... WP_APP_PASSWORD=... demos/terminal/prepare.sh)"
#   vhs demos/terminal/app-push.tape
#
# prepare.sh exports DEMO_PROJECT / HOME / PATH so `lps` and its config resolve to the
# throwaway project it scaffolds. See demos/README.md.

Output demos/.out/terminal-app-push.gif
Output demos/.out/terminal-app-push.mp4

Set Shell bash
Set FontSize 20
Set Width 1200
Set Height 720
Set Padding 28
Set Theme "Aardvark Blue"
Set TypingSpeed 45ms

Hide
Type "cd $DEMO_PROJECT && clear" Enter
Show

Sleep 600ms
Type "lps app push search" Sleep 400ms Enter
Sleep 4s

Type "lps app list" Sleep 400ms Enter
Sleep 3s
