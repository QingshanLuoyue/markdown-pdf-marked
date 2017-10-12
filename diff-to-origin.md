#改版与原版的不同

## 修改markdown-pdf 源码

### 1
``` javascript
  var fs = require('fs')
  var path = require('path')
  var childProcess = require('child_process')
  var through = require('through2')
  var extend = require('extend')
  var Remarkable = require('remarkable')
  var marked = require('marked.js')
  var hljs = require('highlight.js')
  var tmp = require('tmp')
  var duplexer = require('duplexer')
  var streamft = require('stream-from-to')
```

在头部引入里面，增加了marked渲染器的引入

``` javascript
  var marked = require('marked.js')
```

### 2
紧接在后添加 marked的配置
``` javascript
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
    var out = '<img src="' + href + imgAttr;
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
      // console.log(code, lang)
      return require('highlight.js').highlight(lang, code).value;
    }
});
```
在上面 重写了 renderer.code 、renderer.link 、renderer.image 方法，在renderer.code里面的
``` javascript
  return '<pre><code class="' +
        this.options.langPrefix +
        escape(lang, true) +
        ' hljs">' +
        (escaped ? code : escape(code, true)) +
        '\n</code></pre>\n';
```
里面添加了 hljs类名

因为使用 
``` javascript
  require('highlight.js').highlight(lang, code).value; 
```
进行渲染，语言标签不会加上hljs类名，导致最后样式偏差

### 3
``` javascript
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
      console.log(marked(md))
      self.push(marked(md))
      self.push(null)
    }
```
在上面的flush函数里面 注释了
``` javascript
  self.push(mdParser.render(md))
```
添加了
``` javascript
  self.push(marked(md))
```


