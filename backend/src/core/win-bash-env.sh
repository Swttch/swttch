# CCG: force the console to UTF-8 for every non-interactive bash the Claude CLI spawns.
#
# The CLI's Bash tool decodes its subprocess output as UTF-8, but Windows console
# programs print localized text in the legacy OEM codepage (CP949/CP936/CP932), so
# every non-ASCII character reaches the chat as U+FFFD. Setting the codepage at
# CLI spawn time does not survive: measured on ko-KR, the codepage is 65001 in cmd
# and in bash launched from it, but drops back to 949 once the CLI launches the
# tool's bash. bash sources $BASH_ENV on every non-interactive start, which is the
# one hook that runs inside that bash — so the codepage is set there instead.
#
# Under 65001 those programs cannot load their localized string resources and fall
# back to English: readable ASCII instead of garbled text.

# Keep whatever the user already had configured.
if [ -n "$CCG_PREV_BASH_ENV" ] && [ -f "$CCG_PREV_BASH_ENV" ]; then
  . "$CCG_PREV_BASH_ENV"
fi

chcp.com 65001 > /dev/null 2>&1
