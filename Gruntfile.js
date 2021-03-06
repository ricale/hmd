/*global module:false*/
module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    // Metadata.
    pkg: grunt.file.readJSON('package.json'),
    banner: '/*! <%= pkg.title || pkg.name %> - v<%= pkg.version %> - ' +
      '<%= grunt.template.today("yyyy-mm-dd") %>\n' +
      '<%= pkg.homepage ? "* " + pkg.homepage + "\\n" : "" %>' +
      '* Copyright (c) <%= grunt.template.today("yyyy") %> <%= pkg.author.name %>;' +
      ' Licensed <%= _.pluck(pkg.licenses, "type").join(", ") %> */\n',

    directories: {
      src: 'src',
      lib: 'lib',
      dest: 'dist',
    },

    // Task configuration.
    concat: {
      basic: {
        banner: '<%= banner %>',
        stripBanners: true,
        src: [
          // '<%= directories.src %>/indent_helper.js',
          // '<%= directories.src %>/hmd-addon.js'
          '<%= directories.src %>/hmd.js'
        ],
        dest: '<%= directories.dest %>/index.js',
      },
    },
    // uglify: {
    //   options: {
    //     banner: '<%= banner %>'
    //   },
    //   dist: {
    //     src: ['<%= concat.basic.dest %>'],
    //     dest: '<%= directories.dest %>/<%= pkg.name %>.min.js'
    //   }
    // },
    jshint: {
      options: {
        // curly: true,
        // eqeqeq: true,
        immed: true,
        latedef: true,
        newcap: true,
        noarg: true,
        sub: true,
        undef: true,
        unused: true,
        boss: true,
        eqnull: true,
        browser: true,
        globals: {
          'module': true,
          'IndentHelper': true
        }
      },
      gruntfile: {
        src: 'Gruntfile.js'
      },
      basic: {
        src: ['src/*.js']
      }
    },
    // qunit: {
    //   files: ['test/**/*.html']
    // },
    watch: {
      gruntfile: {
        files: '<%= jshint.gruntfile.src %>',
        tasks: ['jshint:gruntfile']
      },
      lib_test: {
        files: '<%= jshint.lib_test.src %>',
        tasks: ['jshint:lib_test', 'qunit']
      }
    }
  });

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  // grunt.loadNpmTasks('grunt-contrib-qunit');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-watch');

  // Default task.
  grunt.registerTask('default', ['jshint', /*'qunit',*/ 'concat', /*'uglify'*/]);

};
