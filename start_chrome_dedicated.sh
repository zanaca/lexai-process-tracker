#!/usr/bin/env bash

PORT=40001
PORT_REMOTE=$(($PORT + 1000))
export TK_SILENCE_DEPRECATION=1


#CHROME_BINARY=/opt/google/chrome/chrome
CHROME_BINARY="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

RUNNING_LINES=$(ps auxwww | grep profile-$PORT | wc -l)
if [ $RUNNING_LINES -gt 3 ]; then
    echo "Quitting, dedicated chrome is already running on port $PORT."
    exit 1
fi

#W=$(python3 -c "import tkinter as tk;r=tk.Tk();print(r.winfo_screenwidth())")
#H=$(python3 -c "import tkinter as tk;r=tk.Tk();print(r.winfo_screenheight())")
W=1360
H=1020



# Bridge for remote machines to conenct on port $PORT+1000. Chrome only allows localhost connections
if [ -z "$LOCAL" ]; then
    echo "Remote connections available at port ${PORT_REMOTE}"
    ssh -L 0.0.0.0:$PORT_REMOTE:localhost:$PORT localhost -N -o StrictHostKeyChecking=no  &
fi




#sleep 200 # Sleep is to allow macos to logon properly
#while true; do; sleep 1
"$CHROME_BINARY" \
    --remote-debugging-port=$PORT \
    --no-first-run \
    --no-default-browser-check \
    --user-data-dir=${SCRIPT_DIR}data/chrome_profiles/profile-$PORT \
    --disable-features=IsolateOrigins,site-per-process \
    --disable-dev-shm-usage \
    --disable-background-timer-throttling \
    --disable-renderer-backgrounding  \
    --window-size=$W,$H \
    --disable-features=Translate \
    --disable-throttle-non-visible-cross-origin-iframes 2>&1
#done
