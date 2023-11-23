#!/bin/bash
set -e

# make sure .config dir exists
mkdir -p /home/chrome/.config
chown chrome:chrome /home/chrome/.config

PORT_REMOTE=$(($PORT + 1000))

echo "Remote connections available at port ${PORT_REMOTE}"
/etc/init.d/ssh start

ssh -L 0.0.0.0:$PORT_REMOTE:localhost:$PORT localhost -N -o StrictHostKeyChecking=no  &


[ -d /home/chrome/chrome_profiles ] || mkdir -p /home/chrome/chrome_profiles

# set sizes for both VNC screen & Chrome window
: ${SCREEN_SIZE:='1024x768'}
IFS='x' read SCREEN_WIDTH SCREEN_HEIGHT <<< "${SCREEN_SIZE}"
export X_SCREEN="${SCREEN_WIDTH}x${SCREEN_HEIGHT}x24"
export CHROME_WINDOW_SIZE="${SCREEN_WIDTH},${SCREEN_HEIGHT}"

export CHROME_OPTS="${CHROME_OPTS_OVERRIDE:- --remote-debugging-port=$PORT  --no-first-run --window-position=0,0 --force-device-scale-factor=1  --no-default-browser-check  --user-data-dir=/home/chrome/chrome_profiles/profile-$PORT  --disable-features=IsolateOrigins,site-per-process  --disable-dev-shm-usage  --disable-background-timer-throttling  --disable-renderer-backgrounding   --disable-features=Translate  --disable-throttle-non-visible-cross-origin-iframes}"

exec "$@"
