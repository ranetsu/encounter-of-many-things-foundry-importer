import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";

import {
  dirname,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import {
  fileURLToPath,
} from "node:url";

import {
  build,
} from "esbuild";

import {
  zipSync,
} from "fflate";

const moduleId =
  "encounter-of-many-things-importer";

const repoRoot =
  resolve(
    dirname(
      fileURLToPath(
        import.meta.url
      )
    ),
    ".."
  );

const distDir =
  join(
    repoRoot,
    "dist"
  );

const packageDir =
  join(
    distDir,
    moduleId
  );

const importerOut =
  join(
    packageDir,
    "scripts",
    "importer.js"
  );

rmSync(
  distDir,
  {
    recursive:
      true,
    force:
      true,
  }
);

mkdirSync(
  dirname(
    importerOut
  ),
  {
    recursive:
      true,
  }
);

for (
  const item of [
    "module.json",
    "README.md",
    "styles",
    "templates",
  ]
) {
  cpSync(
    join(
      repoRoot,
      item
    ),
    join(
      packageDir,
      item
    ),
    {
      recursive:
        true,
    }
  );
}

await build({
  entryPoints: [
    join(
      repoRoot,
      "scripts",
      "importer.js"
    ),
  ],
  bundle:
    true,
  format:
    "esm",
  platform:
    "browser",
  target:
    "es2022",
  outfile:
    importerOut,
  logLevel:
    "warning",
});

const importerContent =
  readFileSync(
    importerOut,
    "utf8"
  );

if (
  /from\s+["']fflate["']|fflate\.module/.test(
    importerContent
  )
) {
  throw new Error(
    "Bundled importer still references an external fflate module."
  );
}

function collectFiles(
  directory
) {
  const files =
    {};

  for (
    const entry of readdirSync(
      directory,
      {
        withFileTypes:
          true,
      }
    )
  ) {
    const path =
      join(
        directory,
        entry.name
      );

    if (entry.isDirectory()) {
      Object.assign(
        files,
        collectFiles(
          path
        )
      );
      continue;
    }

    files[
      relative(
        packageDir,
        path
      ).split(
        sep
      ).join("/")
    ] =
      new Uint8Array(
        readFileSync(
          path
        )
      );
  }

  return files;
}

const zipPath =
  join(
    distDir,
    `${moduleId}.zip`
  );

writeFileSync(
  zipPath,
  zipSync(
    collectFiles(
      packageDir
    ),
    {
      level:
        9,
    }
  )
);

console.log(
  `Packaged ${zipPath}`
);
