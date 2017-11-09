var fs = require('fs')
var path = require('path')
var childProcess = require('child_process')
var through = require('through2')
var extend = require('extend')
var Remarkable = require('remarkable')
var marked = require('marked')
var hljs = require('highlight.js')
var tmp = require('tmp')
var duplexer = require('duplexer')
var streamft = require('stream-from-to')


var renderer = new marked.Renderer();
// marked里重新定义了escape 和unescape 函数，重写renderer.code 方法的时候会用到，所以在这里再定义一次
function escape(html, encode) {
  return html
    .replace(!encode ? /&(?!#?\w+;)/g : /&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unescape(html) {
  // explicitly match decimal, hex, and named HTML entities 
  return html.replace(/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/g, function(_, n) {
    n = n.toLowerCase();
    if (n === 'colon') return ':';
    if (n.charAt(0) === '#') {
      return n.charAt(1) === 'x'
        ? String.fromCharCode(parseInt(n.substring(2), 16))
        : String.fromCharCode(+n.substring(1));
    }
    return '';
  });
}

renderer.code = function(code, lang, escaped) {
    if (this.options.highlight) {
        var out = this.options.highlight(code, lang);
        if (out != null && out !== code) {
            escaped = true;
            code = out;
        }
    }

    if (!lang) {
        return '<pre><code>' +
            (escaped ? code : escape(code, true)) +
            '\n</code></pre>';
    }

    return '<pre><code class="' +
        this.options.langPrefix +
        escape(lang, true) +
        ' hljs">' +
        (escaped ? code : escape(code, true)) +
        '\n</code></pre>\n';
};
renderer.link = function(href, title, text) {
    if (this.options.sanitize) {
        try {
            var prot = decodeURIComponent(unescape(href))
                .replace(/[^\w:]/g, '')
                .toLowerCase();
        } catch (e) {
            return '';
        }
        if (prot.indexOf('javascript:') === 0 || prot.indexOf('vbscript:') === 0 || prot.indexOf('data:') === 0) {
            return '';
        }
    }
    var solveText = text.toString().split('|');
    var strTarget = '';
    if (solveText[1]) {
        strTarget = 'target="_' + solveText[1].replace(/\s/g, '') + '"';
    }
    var out = '<a ' + strTarget + ' href="' + href + '"';
    if (title) {
        out += ' title="' + title + '"';
    }
    out += '>' + solveText[0] + '</a>';
    return out;
};
renderer.image = function(href, title, text) {
    var imgAttr = '';
    if (text) {
        var s = text.toString().replace(/\s/, '').split('|');
        if (s[0]) {
            s[0] = s[0].replace(/&#39;/g, '');
            imgAttr += ' alt="' + s[0].replace(/@/, '') + '"';
            console.log(imgAttr);
        }
        if (s[1]) {
            imgAttr += ' style="text-align:' + s[1] + ';';
        }
        if (s[2]) {
            var w = s[2].split('x')[0];
            var h = s[2].split('x')[1];
            w = w == 0 ? 'auto' : (w + 'px');
            h = h == 0 ? 'auto' : h + ('px');
            imgAttr += 'width:' + w + ';height:' + h + ';';
        }
        imgAttr += '" ';
    }
    var out = '<img src="' + href + '" ' + imgAttr;
    if (title) {
        out += ' title="' + title + '"';
    }
    out += this.options.xhtml ? '/>' : '>';
    return out;
};
marked.setOptions({
    renderer: renderer,
    langPrefix: '',
    gfm: true,
    tables: true,
    breaks: false,
    pedantic: false,
    sanitize: false,
    smartLists: true,
    smartypants: false,
    highlight: function (code, lang) {
      // return require('highlight.js').highlightAuto(code).value;
      // console.log(require('highlight.js').highlight(lang, code).value)
      console.log('lang = ', lang)
      // 此处可能md文档中没有制定语言，导致传入highlight的lang为undefined，导致highlight.js报错，所以默认语言为sql
      if (!lang) {
        lang = 'sql';
      }
      return require('highlight.js').highlight(lang, code).value;
    }
});

tmp.setGracefulCleanup()

function markdownpdf (opts) {
  opts = opts || {}
  opts.cwd = opts.cwd ? path.resolve(opts.cwd) : process.cwd()
  opts.phantomPath = opts.phantomPath || require('phantomjs-prebuilt').path
  opts.runningsPath = opts.runningsPath ? path.resolve(opts.runningsPath) : path.join(__dirname, 'runnings.js')
  opts.cssPath = opts.cssPath ? path.resolve(opts.cssPath) : path.join(__dirname, 'css', 'pdf.css')
  opts.highlightCssPath = opts.highlightCssPath ? path.resolve(opts.highlightCssPath) : path.join(__dirname, 'css', 'highlight.css')
  opts.paperFormat = opts.paperFormat || 'A4'
  opts.paperOrientation = opts.paperOrientation || 'portrait'
  opts.paperBorder = opts.paperBorder || '2cm'
  opts.renderDelay = opts.renderDelay == null ? 0 : opts.renderDelay
  opts.loadTimeout = opts.loadTimeout == null ? 10000 : opts.loadTimeout
  opts.preProcessMd = opts.preProcessMd || function () { return through() }
  opts.preProcessHtml = opts.preProcessHtml || function () { return through() }
  opts.remarkable = extend({html: true, breaks: true}, opts.remarkable)
  opts.remarkable.preset = opts.remarkable.preset || 'default'
  opts.remarkable.plugins = opts.remarkable.plugins || []
  opts.remarkable.syntax = opts.remarkable.syntax || []

  var md = ''

  var mdToHtml = through(
    function transform (chunk, enc, cb) {
      md += chunk
      cb()
    },
    function flush (cb) {
      var self = this

      var mdParser = new Remarkable(opts.remarkable.preset, extend({
        highlight: function (str, lang) {
          if (lang && hljs.getLanguage(lang)) {
            try {
              return hljs.highlight(lang, str).value
            } catch (err) {}
          }

          try {
            return hljs.highlightAuto(str).value
          } catch (err) {}

          return ''
        }
      }, opts.remarkable))

      opts.remarkable.plugins.forEach(function (plugin) {
        if (plugin && typeof plugin === 'function') {
          mdParser.use(plugin)
        }
      })

      opts.remarkable.syntax.forEach(function (rule) {
        try {
          mdParser.core.ruler.enable([rule])
        } catch (err) {}
        try {
          mdParser.block.ruler.enable([rule])
        } catch (err) {}
        try {
          mdParser.inline.ruler.enable([rule])
        } catch (err) {}
      })

      // self.push(mdParser.render(md))
      // console.log(md)
      // console.log(marked(md))
      self.push(marked(md))
      self.push(null)
    }
  )

  var inputStream = through()
  var outputStream = through()

  // Stop input stream emitting data events until we're ready to read them
  inputStream.pause()

  // Create tmp file to save HTML for phantom to process
  tmp.file({postfix: '.html'}, function (err, tmpHtmlPath, tmpHtmlFd) {
    if (err) return outputStream.emit('error', err)
    fs.closeSync(tmpHtmlFd)

    // Create tmp file to save PDF to
    tmp.file({postfix: '.pdf'}, function (err, tmpPdfPath, tmpPdfFd) {
      if (err) return outputStream.emit('error', err)
      fs.closeSync(tmpPdfFd)

      var htmlToTmpHtmlFile = fs.createWriteStream(tmpHtmlPath)

      htmlToTmpHtmlFile.on('finish', function () {
        // Invoke phantom to generate the PDF
        var childArgs = [
          path.join(__dirname, 'phantom', 'render.js'),
          tmpHtmlPath,
          tmpPdfPath,
          opts.cwd,
          opts.runningsPath,
          opts.cssPath,
          opts.highlightCssPath,
          opts.paperFormat,
          opts.paperOrientation,
          opts.paperBorder,
          opts.renderDelay,
          opts.loadTimeout
        ]

        childProcess.execFile(opts.phantomPath, childArgs, function (err, stdout, stderr) {
          // if (stdout) console.log(stdout)
          // if (stderr) console.error(stderr)
          if (err) return outputStream.emit('error', err)
          fs.createReadStream(tmpPdfPath).pipe(outputStream)
        })
      })

      // Setup the pipeline
      inputStream
        .pipe(opts.preProcessMd())
        .pipe(mdToHtml)
        .pipe(opts.preProcessHtml())
        .pipe(htmlToTmpHtmlFile)

      inputStream.resume()
    })
  })

  return extend(
    duplexer(inputStream, outputStream),
    streamft(function () {
      return markdownpdf(opts)
    })
  )
}

module.exports = markdownpdf
