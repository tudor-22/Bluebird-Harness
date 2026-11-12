#!/bin/zsh
# snap.sh <out.png> : grabs a current frame of the Bluebird window (id 58) via a 2s winrec clip
D=/private/tmp/claude-501/-Users-tudor--claude-spares-spare-xFiG6V/eab4c9bf-d37b-4205-9a4e-c485376e97a5/scratchpad
rm -f $D/snap.mov
/Users/tudor/Documents/GitHub/Bluebird-Harness/.tools/winrec ${WID:-58} $D/snap.mov 10 >/dev/null 2>&1 </dev/null &
P=$!; sleep 2.2; kill -INT $P; sleep 1.2
rm -f $D/snap.mov.png; qlmanage -t -s ${SIZE:-1400} -o $D $D/snap.mov >/dev/null 2>&1
mv $D/snap.mov.png "$1"
