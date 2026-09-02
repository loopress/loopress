#!/bin/bash
# Bring the demo WordPress back to "fresh, no Loopress" so a take exercises the full
# `lps project config` flow (including the Loopress Full auto-install).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

# 1. Drop every Loopress plugin. The folder removal is the part that matters: WordPress
#    refuses the upload if the destination folder already exists.
dc exec -T wpcli wp plugin deactivate loopress-full loopress loopress-light 2>/dev/null || true
dc exec -T -u 0 wordpress sh -c 'cd /var/www/html/wp-content/plugins && rm -rf loopress loopress-full loopress-light'

# 2. Remove any temp admin a previous run left behind if it died mid-install.
admins=$(dc exec -T wpcli wp user list --role=administrator --field=user_login 2>/dev/null | tr -d '\r' || true)
for u in $admins; do
  case "$u" in
    lps-temp-*|lpsprobe)
      dc exec -T wpcli wp user delete "$u" --yes --reassign=1 2>/dev/null || true ;;
  esac
done

# 3. Keep wp-content writable by the web server (the plugin upload needs it).
dc exec -T -u 0 wordpress sh -c 'chown -R www-data:www-data /var/www/html/wp-content'

echo "reset-wp: plugins now ->"
dc exec -T wpcli wp plugin list --fields=name,status 2>&1 | tr -d '\r' || true
