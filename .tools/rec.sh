#!/bin/zsh
# rec.sh start <name> | rec.sh stop      -> ~/Desktop/Recordings/<name>.mov (Bluebird window only)
OUT=$HOME/Desktop/Recordings; PIDF=/tmp/winrec.pid
case "$1" in
  start) nohup /Users/tudor/Documents/GitHub/Bluebird-Harness/.tools/winrec ${WID:-58} "$OUT/$2.mov" 30 >/tmp/winrec.log 2>&1 </dev/null &
         echo $! > $PIDF; sleep 1.5; tail -1 /tmp/winrec.log ;;
  stop)  kill -INT $(cat $PIDF); sleep 2; tail -1 /tmp/winrec.log ;;
esac
