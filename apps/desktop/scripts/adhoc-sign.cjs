// Gives the finished app an ad-hoc signature, which Apple Silicon requires of every program
// it runs. (A paid Developer ID and notarization would remove the "unidentified developer" prompt.)
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  // The app's own helper (which reads other apps' windows) keeps the signature it was built with.
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
};
