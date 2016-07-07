// @flow

import child from "child_process";
import spawn from "cross-spawn";
import objectAssign from "object-assign";
import syncExec from "sync-exec";
import EventEmitter from "events";

// Keep track of how many live children we have.
let children = 0;

// This is used to alert listeners when all children have exited.
const emitter = new EventEmitter;

export default class ChildProcessUtilities {
  static exec(command: string, opts: ?Object, callback: (stderr: ?string, stdout: ?string) => mixed) {
    return ChildProcessUtilities.registerChild(
      child.exec(command, opts || {}, (err: ?Error, stdout, stderr) => {
        if (err != null) {
          let error = err.message;

          // If the error from `child.exec` is just that the child process
          // emitted too much on stderr, then that stderr output is likely to
          // be useful.
          if (/^stderr maxBuffer exceeded/.test(error)) {
            error = `Error: ${error}.  Partial output follows:\n\n${stderr.toString()}`;
          }

          callback(error || stderr.toString(), stdout.toString());
        } else {
          callback(null, stdout.toString());
        }
      })
    );
  }

  static execSync(command: string, opts: ?Object): string {
    const mergedOpts = objectAssign({
      encoding: "utf8"
    }, opts);

    if (child.execSync) {
      return child.execSync(command, mergedOpts).trim();
    } else {
      return syncExec(command, mergedOpts).stdout.trim();
    }
  }

  static spawn(command: string, args: Array<any>, opts: ?Object, callback: () => mixed) {
    let stderr = "";

    const childProcess = ChildProcessUtilities.registerChild(
      spawn(command, args, objectAssign({
        stdio: "inherit"
      }, opts))
        .on("error", () => {})
        .on("exit", (code: number) => {
          callback(code && (stderr || `Command failed: ${command} ${args.join(" ")}`));
        })
    );

    // By default stderr is inherited from us (just sent to _our_ output).
    // If the caller overrode that to "pipe", then we'll gather that up and
    // call back with it in case of failure.
    if (childProcess.stderr) {
      childProcess.stderr.setEncoding("utf8");
      childProcess.stderr.on("data", (chunk: string) => stderr += chunk);
    }
  }

  static registerChild(child) {
    children++;
    child.on("exit", () => {
      children--;
      if (children === 0) {
        emitter.emit("empty");
      }
    });
    return child;
  }

  static getChildProcessCount() {
    return children;
  }

  static onAllExited(callback) {
    emitter.on("empty", callback);
  }
}
