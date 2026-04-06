/*───────────────────────────────────

Obsidian Theme Compiler

────────────────────────────────────

MIT License
Copyright (c) 2024 Cecilia May

uses GruntJS (https://gruntjs.com/) to
make it easier to develop
and test Obsidian themes.

● FEATURES ●
-   Auto-discovers CSS files in src/
-   Minifies with Lightning CSS
-   Preserves @settings comment for Obsidian
-   Hot reloads to dev vault

Remix from @kepano Minimal Theme Compiler

Read more at https://git.new/primary/obsidian

────────────────────────────────────*/

// ═══════════════════════════════════════════════════════════════════
// GLOBAL CONFIGURATION TOGGLES
// ═══════════════════════════════════════════════════════════════════

// Set to false to skip copying files to Obsidian vault (faster builds)
const ENABLE_HOT_RELOAD = true;

// Set to false to skip generating unminified Sanctuary.css (faster builds)
const GENERATE_DEV_CSS = false;

// ═══════════════════════════════════════════════════════════════════

module.exports = function (grunt) {
  // Auto-load all grunt tasks from package.json
  require("load-grunt-tasks")(grunt);

  // Auto-discover all CSS files in src/ and subdirectories
  const cssFiles = grunt.file.expand(
    { filter: "isFile" },
    "src/**/*.css",
    "!src/original.css", // Exclude backup/original files
  );

  // Build dynamic config based on toggles
  const concatFiles = {};
  if (GENERATE_DEV_CSS) {
    concatFiles["dist/Sanctuary.css"] = cssFiles;
  }
  concatFiles["dist/theme.css"] = cssFiles;

  grunt.initConfig({
    pkg: grunt.file.readJSON("package.json"),

    // Load environment variables from .env file
    env: {
      vault: {
        src: ".env",
      },
    },

    // Concatenate CSS files
    concat_css: {
      dist: {
        files: concatFiles,
      },
    },

    // Process CSS with Lightning CSS (minification + modern CSS support)
    postcss: {
      options: {
        processors: [
          require("postcss-lightningcss")({
            minify: true,
            sourceMap: false,
          }),
        ],
      },
      minified: {
        files: {
          "dist/theme.css": "dist/theme.css",
        },
      },
    },

    // Watch for changes
    watch: {
      options: {
        spawn: false,
        interrupt: true,
      },
      css: {
        files: ["src/**/*.css", "src/**/*.scss"],
        tasks: ENABLE_HOT_RELOAD
          ? [
              "concat_css",
              "postcss",
              "inject_settings",
              "copy_manifest",
              "hot_reload",
            ]
          : ["build"],
      },
      manifest: {
        files: ["manifest.json"],
        tasks: ENABLE_HOT_RELOAD
          ? ["copy_manifest", "hot_reload"]
          : ["copy_manifest"],
      },
      config: {
        files: [".env", "Gruntfile.js"],
        tasks: ENABLE_HOT_RELOAD
          ? [
              "env",
              "concat_css",
              "postcss",
              "inject_settings",
              "copy_manifest",
              "hot_reload",
            ]
          : ["env", "build"],
        options: { reload: true },
      },
    },
  });

  // Build task: concat, minify, inject settings, copy manifest
  const buildTasks = [
    "concat_css",
    "postcss",
    "inject_settings",
    "copy_manifest",
  ];
  grunt.registerTask("build", buildTasks);

  // Copy manifest.json to dist/
  grunt.registerTask("copy_manifest", "Copy manifest to dist", function () {
    if (grunt.file.exists("manifest.json")) {
      grunt.file.copy("manifest.json", "dist/manifest.json");
      grunt.log.ok("Copied manifest.json -> dist/manifest.json");
    }
  });

  // Inject @settings comment after minification
  grunt.registerTask(
    "inject_settings",
    "Inject @settings comment",
    function () {
      const styleSettingsPath = "src/style-settings.css";
      const themePath = "dist/theme.css";

      if (!grunt.file.exists(styleSettingsPath)) {
        grunt.fail.warn("style-settings.css not found");
        return;
      }

      const content = grunt.file.read(styleSettingsPath);
      const match = content.match(/\/\* @settings[\s\S]*?\*\//);

      if (!match) {
        grunt.fail.warn("@settings comment not found in style-settings.css");
        return;
      }

      const themeContent = grunt.file.read(themePath);
      grunt.file.write(themePath, match[0] + "\n" + themeContent);
      grunt.log.ok("Injected @settings comment into dist/theme.css");
    },
  );

  // Hot reload: copy to Obsidian vault
  grunt.registerTask("hot_reload", "Copy theme to vault", function () {
    if (!ENABLE_HOT_RELOAD) {
      grunt.log.writeln("Hot reload disabled (ENABLE_HOT_RELOAD = false)");
      return;
    }

    const done = this.async();
    const path = require("path");
    const fs = require("fs");

    const obsidianPath = process.env.OBSIDIAN_PATH || "";
    const destDir = path.join(
      process.env.HOME,
      obsidianPath,
      "Sanctuary Redux",
    );

    const files = [
      { src: "dist/theme.css", dest: "theme.css" },
      { src: "dist/manifest.json", dest: "manifest.json" },
    ];

    // Create directory if needed
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    let pending = files.length;
    let errors = [];

    files.forEach(({ src, dest }) => {
      const destPath = path.join(destDir, dest);
      fs.copyFile(src, destPath, (err) => {
        if (err) errors.push(`${src}: ${err.message}`);
        else grunt.log.ok(`Copied ${src} -> ${destPath}`);

        if (--pending === 0) {
          if (errors.length) {
            errors.forEach((e) => grunt.log.error(e));
            grunt.log.warn("Hot reload failed, but CSS was built successfully");
            // Don't fail - allow watch to continue and injection to persist
            done();
          } else {
            done();
          }
        }
      });
    });
  });

  // Development: watch with env loading
  const defaultTasks = ["env", "build"];
  if (ENABLE_HOT_RELOAD) {
    defaultTasks.push("watch");
  }
  grunt.registerTask("default", defaultTasks);

  // One-time build
  grunt.registerTask("compile", ["env", "build"]);
};
