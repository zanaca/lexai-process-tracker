#!/bin/bash

cd ${APPDIR};
if [ ! -d node_modules ]; then
    echo "No modules found. Running installation."
    PWD=`pwd`
    runuser -l `stat -c "%U" .` -c "cd $PWD; yarn"

fi

./node_modules/.bin/nodemon --expose-gc --inspect=0.0.0.0:58036 src/server.js
