#!/bin/bash
# Bring the demo WordPress up and make it ready for the screencast. Idempotent: safe to
# re-run. Assumes docker + docker compose are available.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

echo "wp-setup: starting the stack..."
dc up -d

echo "wp-setup: waiting for WordPress to answer..."
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$WP_URL/wp-login.php" || true)
  [ "$code" = "200" ] && break
  sleep 2
done
[ "${code:-}" = "200" ] || { echo "wp-setup: WordPress never came up ($code)"; exit 1; }

# Core install (no-op if already installed).
if ! dc exec -T wpcli wp core is-installed >/dev/null 2>&1; then
  echo "wp-setup: installing WordPress core..."
  dc exec -T wpcli wp core install \
    --url="$WP_URL" --title="Loopress Demo" \
    --admin_user=admin --admin_password=admin \
    --admin_email=admin@example.com --skip-email
fi

# Pretty permalinks (the CLI hits /wp-json/, which needs the rewrite active).
dc exec -T wpcli wp rewrite structure '/%postname%/' >/dev/null 2>&1 || true
dc exec -T wpcli wp rewrite flush >/dev/null 2>&1 || true

# Application Passwords over plain http are only allowed on a "local" site.
dc exec -T -u 0 wordpress sh -c 'chmod 666 /var/www/html/wp-config.php' 2>/dev/null || true
dc exec -T wpcli wp config set WP_ENVIRONMENT_TYPE local --type=constant >/dev/null 2>&1 || true

# The plugin upload writes into wp-content; make sure the web server owns it.
dc exec -T -u 0 wordpress sh -c \
  'mkdir -p /var/www/html/wp-content/uploads && chown -R www-data:www-data /var/www/html/wp-content'

echo "wp-setup: ready."
dc exec -T wordpress sh -c 'php -r "echo \"upload_max_filesize=\".ini_get(\"upload_max_filesize\").\"\n\";"'
dc exec -T wpcli wp eval 'echo "env=".wp_get_environment_type()."\n";'
