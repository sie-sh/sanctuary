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
const themeName = "Sanctuary Redux";

module.exports = function (grunt) {
  const path = require("path");
  const fs = require("fs");
  const os = require("os");

  // Auto-load all grunt tasks from package.json
  require("load-grunt-tasks")(grunt);

  // Helper: Read boolean env var with default
  const getBool = (name, defaultValue) => {
    const val = process.env[name];
    if (val === undefined) return defaultValue;
    return val.toLowerCase() === "true" || val === "1";
  };

  // Resolve vault path to absolute (supports ~/ and ~\ on any platform)
  // Returns: {themesDir}/themeName/
  const resolveVaultPath = (vaultPath) => {
    if (!vaultPath) return null;
    vaultPath = vaultPath.replace(/^["']|["']$/g, "");
    // Expand ~/ or ~\ to home directory
    if (vaultPath.startsWith("~/") || vaultPath.startsWith("~\\")) {
      vaultPath = path.join(os.homedir(), vaultPath.slice(2));
    }
    return path.resolve(path.join(vaultPath, themeName));
  };

  // Auto-discover all CSS files in src/ and subdirectories
  const cssFiles = grunt.file.expand(
    { filter: "isFile" },
    "src/**/*.css",
    "!src/original.css", // Exclude backup/original files
  );

  grunt.initConfig({
    pkg: grunt.file.readJSON("package.json"),

    // Load environment variables from .env file
    env: {
      vault: {
        src: ".env",
      },
    },

    // Concatenate CSS files - always generates theme.css
    concat_css: {
      dist: {
        files: {
          "dist/theme.css": cssFiles,
        },
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
        tasks: [
          "concat_css",
          "generate_dev_css",
          "postcss",
          "inject_settings",
          "copy_manifest",
          "hot_reload",
        ],
      },
      manifest: {
        files: ["manifest.json"],
        tasks: ["copy_manifest", "hot_reload"],
      },
      config: {
        files: [".env", "Gruntfile.js"],
        tasks: [
          "env",
          "concat_css",
          "generate_dev_css",
          "postcss",
          "inject_settings",
          "copy_manifest",
          "hot_reload",
        ],
        options: { reload: true },
      },
    },
  });

  // Generate unminified Sanctuary.css
  grunt.registerTask(
    "generate_dev_css",
    "Generate unminified Sanctuary.css",
    function () {
      if (!getBool("GENERATE_DEV_CSS", false)) return;
      const content = cssFiles.map((file) => grunt.file.read(file)).join("\n");
      grunt.file.write("dist/Sanctuary.css", content);
      grunt.log.ok("Created dist/Sanctuary.css");
    },
  );

  // Build task: concat, dev css, minify, inject settings, copy manifest
  // Note: env should be loaded before calling build (see default task)
  grunt.registerTask("build", [
    "concat_css",
    "generate_dev_css",
    "postcss",
    "inject_settings",
    "copy_manifest",
  ]);

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
    const done = this.async();
    const destDir = resolveVaultPath(process.env.OBSIDIAN_PATH);

    if (!destDir) {
      grunt.log.warn("OBSIDIAN_PATH not set, skipping hot reload");
      return done();
    }

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
          }
          done();
        }
      });
    });
  });

  // Development: build once, then watch and hot reload
  grunt.registerTask("default", ["env", "build", "watch"]);

  // One-time build
  grunt.registerTask("compile", ["env", "build"]);
};
