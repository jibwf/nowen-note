/**
 * Stable release wrapper around the full desktop builder configuration.
 *
 * Keep the large platform/ABI configuration in builder.base.config.js while
 * enforcing updater-safe asset names and metadata verification here.
 */
const base = require("./builder.base.config.js");
const verifyUpdateArtifacts = require("../build/verifyUpdateArtifacts.js");

module.exports = {
  ...base,
  files: [
    ...(Array.isArray(base.files) ? base.files : []),
    "!electron/builder.base.config.js",
    "!electron/builder.lite.base.config.js",
  ],
  nsis: {
    ...(base.nsis || {}),
    artifactName: "Nowen-Note-${version}-setup.${ext}",
  },
  portable: {
    ...(base.portable || {}),
    artifactName: "Nowen-Note-${version}-portable.${ext}",
  },
  mac: {
    ...(base.mac || {}),
    artifactName: "Nowen-Note-${version}-${arch}.${ext}",
  },
  linux: {
    ...(base.linux || {}),
    artifactName: "Nowen-Note-${version}-${arch}.${ext}",
  },
  afterAllArtifactBuild: verifyUpdateArtifacts,
};
