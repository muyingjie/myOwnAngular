/**
 * Created by lenovo on 2017/2/16.
 */
function $CompileProvider($provide) {
    var hasDirectives = {};

    this.directive = function(name, directiveFactory) {
        // directive可以通过
        //      module.directive("aaa", function(){})
        // 来调用

        // 也可以通过
        // module.directive({
        //      a: function() {},
        //      b: function() {},
        //      c: function() {},
        // })
        // 来创建多个指令
        if (_.isString(name)) {
            if (name === 'hasOwnProperty') {
                throw 'hasOwnProperty is not a valid directive name';
            }

            // $provide.factory(name + 'Directive', directiveFactory);
            // 同名的directive可以有多个，因为directive可以用于元素、属性、类名、注释等
            if (!hasDirectives.hasOwnProperty(name)) {
                hasDirectives[name] = [];
                $provide.factory(name + 'Directive', ['$injector', function ($injector) {
                    // 等将来该函数被调用时factories里面会有很多项
                    var factories = hasDirectives[name];
                    // return _.map(factories, $injector.invoke);
                    return _.map(factories, function(factory, i) {
                        var directive = $injector.invoke(factory);
                        directive.restrict = directive.restrict || 'EA';
                        // priority默认为0
                        directive.priority = directive.priority || 0;
                        // name用于在priority属性值相同时的比较
                        directive.name = directive.name || name;
                        // index用于在priority和name值都相同时的比较
                        directive.index = i;
                        return directive;
                    });
                }]);
            }
            hasDirectives[name].push(directiveFactory);
        } else {
            _.forEach(name, function(directiveFactory, name) {
                this.directive(name, directiveFactory);
            }, this);
        }
    };
    this.$get = ["$injector", function($injector) {
        var PREFIX_REGEXP = /(x[\:\-_]|data[\:\-_])/i;
        // $compileNodes是一个jquery封装的DOM对象
        function compile($compileNodes) {
            return compileNodes($compileNodes);
        }
        function compileNodes($compileNodes) {
            _.forEach($compileNodes, function(node) {
                var attrs = {};
                var directives = collectDirectives(node);
                // 阻止遍历子节点
                var terminal = applyDirectivesToNode(directives, node, attrs);
                // 递归遍历所有DOM节点
                // if (node.childNodes && node.childNodes.length) {
                if (!terminal && node.childNodes && node.childNodes.length) {
                    compileNodes(node.childNodes);
                }
            });
        }
        // directives拿到的是在Angular module对象上注册的directive函数
        function applyDirectivesToNode(directives, compileNode, attrs) {
            var $compileNode = $(compileNode);
            var terminalPriority = -Number.MAX_VALUE;
            var terminal = false;
            _.forEach(directives, function(directive) {
                if (directive.$$start) {
                    $compileNode = groupScan(compileNode, directive.$$start, directive.$$end);
                }
                // 优先级值小于终止优先级的指令不参与编译
                if (directive.priority < terminalPriority) {
                    return false;
                }
                if (directive.compile) {
                    directive.compile($compileNode);
                }
                // 当某个指令有terminal属性且值为true时，该节点及其子节点均不参加编译
                if (directive.terminal) {
                    terminal = true;
                    terminalPriority = directive.priority;
                }
            });
            return terminal;
        }
        function groupScan(node, startAttr, endAttr) {
            var nodes = [];
            if (startAttr && node && node.hasAttribute(startAttr)) {
                var depth = 0;
                do {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.hasAttribute(startAttr)) {
                            depth++;
                        } else if (node.hasAttribute(endAttr)) {
                            depth--;
                        }
                    }
                    nodes.push(node);
                    node = node.nextSibling;
                } while (depth > 0);
            } else {
                nodes.push(node);
            }
            return $(nodes);
        }
        // node是原生DOM对象
        function collectDirectives(node) {
            var directives = [];
            if (node.nodeType === Node.ELEMENT_NODE) {
                // var normalizedNodeName = _.camelCase(nodeName(node).toLowerCase());
                var normalizedNodeName = directiveNormalize(nodeName(node).toLowerCase());
                // 从注册的指令中提取出元素指令
                addDirective(directives, normalizedNodeName, 'E');
                // 从注册的指令中提取出属性指令
                _.forEach(node.attributes, function (attr) {
                    var attrStartName, attrEndName;
                    var name = attr.name;
                    var normalizedAttrName = directiveNormalize(name.toLowerCase());
                    if (/^ngAttr[A-Z]/.test(normalizedAttrName)) {
                        // normalizedAttrName =
                        //     normalizedAttrName[6].toLowerCase() +
                        //     normalizedAttrName.substring(7);
                        // 工具方法kebabCase将驼峰形式转换为横划线格式
                        name = _.kebabCase(
                            normalizedAttrName[6].toLowerCase() +
                            normalizedAttrName.substring(7)
                        );
                    }
                    var directiveNName = normalizedAttrName.replace(/(Start|End)$/, '');
                    if (directiveIsMultiElement(directiveNName)) {
                        if (/Start$/.test(normalizedAttrName)) {
                            // attrStartName = normalizedAttrName;
                            // attrEndName =
                            //     normalizedAttrName.substring(0, normalizedAttrName.length - 5) + 'End';
                            // normalizedAttrName =
                            //     normalizedAttrName.substring(0, normalizedAttrName.length - 5);
                            attrStartName = name;
                            attrEndName = name.substring(0, name.length - 5) + 'end';
                            name = name.substring(0, name.length - 6);
                        }
                    }
                    normalizedAttrName = directiveNormalize(name.toLowerCase());
                    addDirective(directives, normalizedAttrName, 'A', attrStartName, attrEndName);
                });
                // 从注册的指令中提取出样式指令
                _.forEach(node.classList, function (cls) {
                    var normalizedClassName = directiveNormalize(cls);
                    addDirective(directives, normalizedClassName, 'C');
                });
            } else if (node.nodeType === Node.COMMENT_NODE) {
                // 从注册的指令中提取出注释指令
                var match = /^\s*directive\:\s*([\d\w\-_]+)/.exec(node.nodeValue);
                if (match) {
                    addDirective(directives, directiveNormalize(match[1]), 'M');
                }
            }
            directives.sort(byPriority);
            return directives;
        }
        function directiveIsMultiElement(name) {
            if (hasDirectives.hasOwnProperty(name)) {
                var directives = $injector.get(name + 'Directive');
                return _.any(directives, {multiElement: true});
            }
            return false;
        }
        function byPriority(a, b) {
            var diff = b.priority - a.priority;
            if (diff !== 0) {
                return diff;
            } else {
                if (a.name !== b.name) {
                    return (a.name < b.name ? -1 : 1);
                } else {
                    return a.index - b.index;
                }
            }
        }
        function directiveNormalize(name) {
            return _.camelCase(name.replace(PREFIX_REGEXP, ''));
        }
        // element既可以是原生DOM对象，也可以是jqueryDOM对象
        function nodeName(element) {
            return element.nodeName ? element.nodeName : element[0].nodeName;
        }
        function addDirective(directives, name, mode, attrStartName, attrEndName) {
            if (hasDirectives.hasOwnProperty(name)) {
                // directives.push.apply(directives, $injector.get(name + 'Directive'));
                var foundDirectives = $injector.get(name + 'Directive');
                // 将对应模式的指令筛选出来再放到directives数组中
                var applicableDirectives = _.filter(foundDirectives, function(dir) {
                    return dir.restrict.indexOf(mode) !== -1;
                });
                // directives.push.apply(directives, applicableDirectives);
                _.forEach(applicableDirectives, function(directive) {
                    if (attrStartName) {
                        directive = _.create(directive, {
                            $$start: attrStartName,
                            $$end: attrEndName
                        });
                    }
                    directives.push(directive);
                });
            }
        }
        return compile;
    }];
}
$CompileProvider.$inject = ['$provide'];