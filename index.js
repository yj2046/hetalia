var path = require('path');
var fs = require('fs');
var fis = module.exports = require('fis3');
fis.require.prefixes.unshift('hetalia');
fis.cli.name = 'hetalia';
fis.cli.info = require('./package.json');

/******************** dev start ********************/

// dep文件夹为bower的下载目录，有大量的冗余资源，可能导致编译失败。
// 因此编译时屏蔽该目录，但是会自动找出其中被引用的资源。
fis.set('project.files', ['!dep/**']);

// 模块加载采用amd方案，对应在fis中使用fis3-hook-amd插件。
// fis3-hook-amd：https://github.com/fex-team/fis3-hook-amd
// esl.js是实现了amd规范子集的模块加载器。
// esl.js：https://github.com/ecomfe/esl
fis.hook('amd', {
    globalAsyncAsSync: true,
    paths: {
        dep: '/dep'
    }
});

// 模板预处理：
// 1) 根据 media 参数选择执行代码段
// 2) 实现模板继承语法糖
fis.match('*.html', {
    parser: function (content, fileObj) {
        if (!content) {
            return "";
        }
        content = processMedias(content);
        content = processExtend(content);
        return content;

        /**
         * 模板继承语法糖：
         *
         * 1) extends语法
         * ##{extends file='parent.tpl'}
         *
         * 2) block语法
         * ##{block name="title"}
         * ##{/block}
         */
        function processExtend (tplContent) { // 模板继承语法糖
            var extendsMatch = tplContent.match(/##\{extends\s+file\s*=\s*["']([^'"]+)["']\s*\}/);
            if (!extendsMatch) {
                return tplContent;
            }

            var relPath = extendsMatch[1];
            var filePath = '';
            if ( relPath.charAt(0) === '/' ) { // 相对 project 根目录
                filePath = path.resolve(fis.project.getProjectPath(), relPath.replace(/^[/]+/, ''));
            } else {
                filePath = path.resolve(fileObj.dirname, relPath);
            }

            fs.accessSync(filePath, fs.R_OK); // 确保父级模板有效
            var parentTplContent = fs.readFileSync(filePath, 'utf8');

            var preRegExp = "##\\{block\\s+name\\s*=\\s*['\"]";
            var sufRegExp = "['\"]\\s*\\}([\\s\\S]*?)##\\{\\/block\\}";
            return parentTplContent.replace(new RegExp(preRegExp + "([^'\"]+)" + sufRegExp, "g"), function (allMatches, name) {
                var blockMatches = tplContent.match(new RegExp(preRegExp + name + sufRegExp));
                return blockMatches ? blockMatches[1] : allMatches;
            });
        }

        /**
         * fis调试语法: 不同的media取值，执行不同的代码段。
         * 
         * 语法如下:
         * <!-- fis-dev-start --> xxx <!-- fis-dev-end -->
         * 当 media = "dev" (默认值)，执行"xxx"代码段
         */
        function processMedias (tplContent) { // 调试语句
            var regexp = "<!--\\s*fis-([^-]+)-start\\s*-->([\\s\\S]*?)<!--\\s*fis-([^-]+)-end\\s*-->";
            var matches = tplContent.match(new RegExp(regexp, 'ig'));

            if (!matches) {
                return tplContent;
            }

            matches.forEach(function (code) {
                var medias = code.match(new RegExp(regexp, 'i'));

                if (medias[1] === medias[3]) {
                    var media = fis.project.currentMedia();
                    if (Array.prototype.indexOf.call((medias[1]).split('|'), media) === -1) {
                        tplContent = tplContent.replace(code, '');
                    }
                }
            });

            return tplContent;
        }
    }
});

// less 混合样式文件，只会被其他less文件import，因此不需要单独发布。
fis.match(/^(.*)mixin\.less$/i,{
    release: false
});

fis.match('*.less', {
    parser: fis.plugin('less'),
    rExt: '.css'
});

// widgets, modules, components和page文件夹下的js文件被认为是模块
// 编译时可以自动包裹factory函数：define(function(require, exports, module) {})
fis.match('**/{widgets,modules,components,page}/**.js', {
    isMod: true
});

// 本地开发期间，velocity模版需要结合mock文件被编译成html文件，需要fis-postprocessor-velocity插件。
// fis-postprocessor-velocity：https://github.com/vicerwang/fis-postprocessor-velocity
fis.match('**/page/**.html', {
    postprocessor: fis.plugin('velocity', {
        commonMock: 'test/common/common.js'
    })
});

fis.match('**/*', {
    release: '/static/$0'
});

fis.match('*.html', {
    useCache: false,
    release: '/template/$0'
});

fis.match('/test/**', {
    release: '/$0'
});

// 在编译期会被内嵌入js文件中，因此不需要发布。
fis.match('*.tpl',{
    release : false
});

// velocity模版对应的mock数据不需要发布。
fis.match('*.html.js', {
    release: false
});

// bower的package文件不需要发布。
fis.match('bower.json', {
    release: false
});

// 文档不需要发布。
fis.match('*.md', {
    release: false
});

// fis配置文件不需要发布。
fis.match('fis-conf.js', {
    useCache: false,
    release: false
});

// 本地调试时，需要将所有子系统下面的server.conf合并到根目录下的server.conf文件，最后发布到config文件夹下。
fis.match('/server.conf', {
    postprocessor: function(content, file) {
        content = '';
        var modConnfPaths = fis.util.find(fis.project.getProjectPath(), ['/**/server.conf']);
        modConnfPaths.forEach(function(modConnfPath) {
            content += fis.util.read(modConnfPath);
        });
        return content;
    },
    useCache: false,
    release: '/config/server.conf'
});

// cdn容灾：运维实时更新静态资源CDN域名
// 模板中的velocity变量名: $!{domain.getStaticDomain()}
// js中的变量名: GLOBAL_CDN_DOMAIN
// fis.match('*.js', {
//     postprocessor: function(content, fileObj) {
//         return content.replace(/['"]([^'"]*)\$\!\{domain\.getStaticDomain\(\s*\)\}([^'"]*)['"]/g, "'" + "$1" + "' + GLOBAL_CDN_DOMAIN + '" + "$2" + "'");
//     }
// });

// cdn容灾：运维实时更新静态资源CDN域名
// 模板中的velocity变量名: $!{domain.getStaticDomain()}
// css文件中取 www.cdnstatic.com，域名切换时由运维完成文本替换
// fis.match('*.{less,css}', {
//     postprocessor: function(content, fileObj) {
//         return content.replace(/\$\!\{domain\.getStaticDomain\(\s*\)\}/g, 'www.cdnstatic.com');
//     }
// });

// 打包的资源类型设置为amd，需要fis3-postpackager-loader插件。
// fis3-postpackager-loader：https://github.com/fex-team/fis3-postpackager-loader
fis.match('::package', {
    postpackager: fis.plugin('loader', {
        resourceType: 'amd',
        useInlineMap: true
    })
});

/******************** dev end ********************/


/******************** qa start ********************/

fis.media('qa').match('*.{less,css,js}', {
    useHash: true
});

fis.media('qa').match('::image', {
    useHash: true
});

fis.media('qa').match('*.{less,css}', {
    useSprite: true
});

fis.media('qa').match('**/page/**.html', {
    postprocessor: null
});

// example不需要发布。
fis.media('qa').match('/example/**', {
    release: false
});

fis.media('qa').match('/test/**', {
    release: false
});

fis.media('qa').match('server.conf', {
    release: false
});

fis.media('qa').match('::package', {
    spriter: fis.plugin('csssprites'),
    postpackager: fis.plugin('loader', {
        resourceType: 'amd',
        useInlineMap: true,
        allInOne: true
    })
});

/******************** qa end ********************/


/******************** prod start ********************/

fis.media('prod').match('*.{less,css,js}', {
    useHash: true
});

fis.media('prod').match('::image', {
    useHash: true
});

fis.media('prod').match('*.{less,css,html:css}', {
    useSprite: true,
    optimizer: fis.plugin('clean-css')
});

fis.media('prod').match('*.png', {
    optimizer: fis.plugin('png-compressor')
});

fis.media('prod').match('*.js', {
    optimizer: fis.plugin('uglify-js', {
        mangle: {
            except: 'exports, module, require, define'
        }
    })
});

fis.media('prod').match('**/page/**.html', {
    postprocessor: null
});

//example不需要发布。
fis.media('prod').match('/example/**', {
    release: false
});

fis.media('prod').match('/test/**', {
    release: false
});

fis.media('prod').match('server.conf', {
    release: false
});

fis.media('prod').match('::package', {
    spriter: fis.plugin('csssprites'),
    postpackager: fis.plugin('loader', {
        resourceType: 'amd',
        useInlineMap: true,
        allInOne: true
    })
});

/******************** prod end ********************/
