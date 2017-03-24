/**
 * Created by lenovo on 2017/3/15-17:15.
 */
function $ControllerProvider() {
    var controllers = {};
    var globals = false;

    this.allowGlobals = function() {
        globals = true;
    };

    this.register = function(name, controller) {
        if (_.isObject(name)) {
            _.extend(controllers, name);
        } else {
            controllers[name] = controller;
        }
    };

    this.$get = ['$injector', function($injector) {
        function addToScope(locals, identifier, instance) {
            if (locals && _.isObject(locals.$scope)) {
                locals.$scope[identifier] = instance;
            } else {
                throw 'Cannot export controller as ' + identifier +
                '! No $scope object provided via locals';
            }
        }
        return function(ctrl, locals, later, identifier) {
            if (_.isString(ctrl)) {
                // ctrl = controllers[ctrl];
                if (controllers.hasOwnProperty(ctrl)) {
                    ctrl = controllers[ctrl];
                } else if (globals) {
                    ctrl = window[ctrl];
                }
            }
            var instance;
            // return $injector.instantiate(ctrl, locals);
            if (later) {
                // instance = Object.create(ctrl);
                var ctrlConstructor = _.isArray(ctrl) ? _.last(ctrl) : ctrl;
                instance = Object.create(ctrlConstructor.prototype);
                if (identifier) {
                    addToScope(locals, identifier, instance);
                }
                return _.extend(function() {
                    $injector.invoke(ctrl, instance, locals);
                    return instance;
                }, {
                    instance: instance
                });
            } else {
                instance = $injector.instantiate(ctrl, locals);
                if (identifier) {
                    addToScope(locals, identifier, instance);
                }
                return instance;
            }
        };
    }];
}

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
                        // 使用外部传进来的link而不使用compile返回来的link
                        if (directive.link && !directive.compile) {
                            directive.compile = _.constant(directive.link);
                        }
                        directive.$$bindings = parseDirectiveBindings(directive);
                        // 分析传入的scope参数
                        // if (_.isObject(directive.scope)) {
                        //     directive.$$isolateBindings = parseIsolateBindings(directive.scope);
                        // }
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

        function parseDirectiveBindings(directive) {
            var bindings = {};
            if (_.isObject(directive.scope)) {
                if (directive.bindToController) {
                    bindings.bindToController = parseIsolateBindings(directive.scope);
                } else {
                    bindings.isolateScope = parseIsolateBindings(directive.scope);
                }
            }
            return bindings;
        }

        function parseIsolateBindings(scope) {
            var bindings = {};
            _.forEach(scope, function(definition, scopeName) {
                // var match = definition.match(/\s*@\s*(\w*)\s*/);
                // var match = definition.match(/\s*([@=])\s*(\w*)\s*/);
                // var match = definition.match(/\s*(@|=(\*?))\s*(\w*)\s*/);
                // var match = definition.match(/\s*(@|=(\*?))(\??)\s*(\w*)\s*/);
                var match = definition.match(/\s*([@&]|=(\*?))(\??)\s*(\w*)\s*/);
                bindings[scopeName] = {
                    // mode: '@',
                    // mode: match[1],
                    mode: match[1][0],
                    collection: match[2] === '*',
                    optional: match[3],
                    // attrName: match[1] || scopeName
                    // attrName: match[2] || scopeName
                    // attrName: match[3] || scopeName
                    attrName: match[4] || scopeName
                };
            });
            return bindings;
        }
    };
    this.$get = ["$injector", "$parse", "$rootScope", "$controller", function($injector, $parse, $rootScope, $controller) {
        function Attributes(element) {
            this.$$element = element;
            // $attr的格式：
            // {
            //     "myDir": "x-my-dir"
            // }
            this.$attr = {};
        }
        // 第3个参数writeAttr代表key属性是否拥有写权限
        // 第4个参数attrName代表将要附加到DOM对象上带有横划线的属性名
        Attributes.prototype.$set = function(key, value, writeAttr, attrName) {
            // 修改实例对象的值 通过attrs.attr来访问
            this[key] = value;

            if (isBooleanAttribute(this.$$element[0], key)) {
                this.$$element.prop(key, value);
            }

            if (!attrName) {
                // attrName = key;
                // attrName = _.kebabCase(key, '-');
                if (this.$attr[key]) {
                    attrName = this.$attr[key];
                } else {
                    attrName = this.$attr[key] = _.kebabCase(key);
                }
            } else {
                this.$attr[key] = attrName;
            }

            if (writeAttr !== false) {
                // 修改DOM对象上的值，通过$ele.attr('attr')来访问
                // this.$$element.attr(key, value);
                this.$$element.attr(attrName, value);
            }

            if (this.$$observers) {
                _.forEach(this.$$observers[key], function(observer) {
                    try {
                        observer(value);
                    } catch (e) {
                        console.log(e);
                    }
                });
            }
        };
        // $$observers
        Attributes.prototype.$observe = function(key, fn) {
            var self = this;
            this.$$observers = this.$$observers || Object.create(null);
            this.$$observers[key] = this.$$observers[key] || [];
            this.$$observers[key].push(fn);
            $rootScope.$evalAsync(function() {
                fn(self[key]);
            });
            return function() {
                var index = self.$$observers[key].indexOf(fn);
                if (index >= 0) {
                    self.$$observers[key].splice(index, 1);
                }
            };
        };
        Attributes.prototype.$addClass = function(classVal) {
            this.$$element.addClass(classVal);
        };
        Attributes.prototype.$removeClass = function(classVal) {
            this.$$element.removeClass(classVal);
        };
        Attributes.prototype.$updateClass = function(newClassVal, oldClassVal) {
            var newClasses = newClassVal.split(/\s+/);
            var oldClasses = oldClassVal.split(/\s+/);
            var addedClasses = _.difference(newClasses, oldClasses);
            var removedClasses = _.difference(oldClasses, newClasses);
            if (addedClasses.length) {
                this.$addClass(addedClasses.join(' '));
            }
            if (removedClasses.length) {
                this.$removeClass(removedClasses.join(' '));
            }
        };
        var PREFIX_REGEXP = /(x[\:\-_]|data[\:\-_])/i;
        var BOOLEAN_ATTRS = {
            multiple: true,
            selected: true,
            checked: true,
            disabled: true,
            readOnly: true,
            required: true,
            open: true
        };
        var BOOLEAN_ELEMENTS = {
            INPUT: true,
            SELECT: true,
            OPTION: true,
            TEXTAREA: true,
            BUTTON: true,
            FORM: true,
            DETAILS: true
        };
        // $compileNodes是一个jquery封装的DOM对象
        function compile($compileNodes) {
            // return compileNodes($compileNodes);
            // compileNodes将返回link函数
            var compositeLinkFn = compileNodes($compileNodes);
            return function publicLinkFn(scope) {
                // 编译
                $compileNodes.data('$scope', scope);
                // 链接
                compositeLinkFn(scope, $compileNodes);
            };
        }
        // 根节点下的所有子节点都有一个link函数nodeLinkFn，同时也有一个总的link函数compositeLinkFn(用于将所有的node)
        // linkFns存储所有子节点的link函数nodeLinkFn
        function compileNodes($compileNodes) {
            var linkFns = [];
            _.forEach($compileNodes, function(node, i) {
                // 为了后期拿属性方便，专门开一个参数存储节点的属性
                // var attrs = {};
                // 由于attrs对象可能会有很多自定义的属性和方法，因此单开了一个构造函数来创建该对象
                var attrs = new Attributes($(node));
                var directives = collectDirectives(node, attrs);
                var nodeLinkFn;
                // 阻止遍历子节点
                // var terminal = applyDirectivesToNode(directives, node, attrs);
                if (directives.length) {
                    nodeLinkFn = applyDirectivesToNode(directives, node, attrs);
                }
                var childLinkFn;
                // 递归遍历所有DOM节点
                // if (node.childNodes && node.childNodes.length) {
                // if (!terminal && node.childNodes && node.childNodes.length) {
                if ((!nodeLinkFn || !nodeLinkFn.terminal) && node.childNodes && node.childNodes.length) {
                    childLinkFn = compileNodes(node.childNodes);
                }
                // 如果遍历到的节点上绑定的指令设置了隔离作用域，加上ng-scope类来标识
                if (nodeLinkFn && nodeLinkFn.scope) {
                    attrs.$$element.addClass('ng-scope');
                }
                if (nodeLinkFn || childLinkFn) {
                    linkFns.push({
                        nodeLinkFn: nodeLinkFn,
                        childLinkFn: childLinkFn,
                        idx: i
                    });
                }
            });
            function compositeLinkFn(scope, linkNodes) {
                // stableNodeList存储最原始的（link执行之前的）dom结构，避免在link的过程中对DOM的增删改对接下来的编译 链接造成影响
                var stableNodeList = [];
                _.forEach(linkFns, function(linkFn) {
                    var nodeIdx = linkFn.idx;
                    stableNodeList[nodeIdx] = linkNodes[nodeIdx];
                });
                _.forEach(linkFns, function(linkFn) {
                    var node = stableNodeList[linkFn.idx];
                    // 如果当前节点没有link方法，则遍历其子节点
                    if (linkFn.nodeLinkFn) {
                        if (linkFn.nodeLinkFn.scope) {
                            scope = scope.$new();
                            $(node).data('$scope', scope);
                        }
                        // linkFn.nodeLinkFn(scope, linkNodes[linkFn.idx]);
                        linkFn.nodeLinkFn(
                            linkFn.childLinkFn,
                            scope,
                            // linkNodes[linkFn.idx]
                            node
                        );
                    } else {
                        linkFn.childLinkFn(
                            scope,
                            // linkNodes[linkFn.idx].childNodes
                            node.childNodes
                        );
                    }
                });
            }
            return compositeLinkFn;
        }
        // directives拿到的是在Angular module对象上注册的directive函数
        // 这个函数里面的linkFns存储每个元素节点上的指令的链接函数
        function applyDirectivesToNode(directives, compileNode, attrs) {
            var $compileNode = $(compileNode);
            var terminalPriority = -Number.MAX_VALUE;
            var terminal = false;
            // var linkFns = [];
            var preLinkFns = [];
            var postLinkFns = [];
            var controllers = {};
            var newScopeDirective;
            var newIsolateScopeDirective;
            var controllerDirectives;

            function addLinkFns(preLinkFn, postLinkFn, attrStart, attrEnd, isolateScope) {
                if (preLinkFn) {
                    if (attrStart) {
                        preLinkFn = groupElementsLinkFnWrapper(preLinkFn, attrStart, attrEnd);
                    }
                    preLinkFn.isolateScope = isolateScope;
                    preLinkFns.push(preLinkFn);
                }
                if (postLinkFn) {
                    if (attrStart) {
                        postLinkFn = groupElementsLinkFnWrapper(postLinkFn, attrStart, attrEnd);
                    }
                    postLinkFn.isolateScope = isolateScope;
                    postLinkFns.push(postLinkFn);
                }
            }

            _.forEach(directives, function(directive) {
                if (directive.$$start) {
                    $compileNode = groupScan(compileNode, directive.$$start, directive.$$end);
                }
                // 优先级值小于终止优先级的指令不参与编译
                if (directive.priority < terminalPriority) {
                    return false;
                }
                if (directive.scope) {
                    if (_.isObject(directive.scope)) {
                        // directive.scope是一个对象的情况，新的作用域
                        if (newIsolateScopeDirective || newScopeDirective) {
                            throw 'Multiple directives asking for new/inherited scope';
                        }
                        newIsolateScopeDirective = directive;
                    } else {
                        // directive.scope为true的情况，继承父级的scope
                        if (newIsolateScopeDirective) {
                            throw 'Multiple directives asking for new/inherited scope';
                        }
                        newScopeDirective = newScopeDirective || directive;
                    }
                }
                if (directive.compile) {
                    // directive.compile($compileNode, attrs);
                    var linkFn = directive.compile($compileNode, attrs);
                    var isolateScope = (directive === newIsolateScopeDirective);
                    var attrStart = directive.$$start;
                    var attrEnd = directive.$$end;
                    if (_.isFunction(linkFn)) {
                        // linkFns.push(linkFn);
                        // postLinkFns.push(linkFn);
                        addLinkFns(null, linkFn, attrStart, attrEnd, isolateScope);
                    } else if (linkFn) {
                        // linkFn是对象的情况，该对象可能包含post和pre两个方法
                        // linkFns.push(linkFn.post);
                        // if (linkFn.pre) {
                        //     preLinkFns.push(linkFn.pre);
                        // }
                        // if (linkFn.post) {
                        //     postLinkFns.push(linkFn.post);
                        // }
                        addLinkFns(linkFn.pre, linkFn.post, attrStart, attrEnd, isolateScope);
                    }
                }
                // 当某个指令有terminal属性且值为true时，该节点及其子节点均不参加编译
                if (directive.terminal) {
                    terminal = true;
                    terminalPriority = directive.priority;
                }
                // 收集带有controller属性的directive
                if (directive.controller) {
                    controllerDirectives = controllerDirectives || {};
                    controllerDirectives[directive.name] = directive;
                }
            });
            // return terminal;
            function nodeLinkFn(childLinkFn, scope, linkNode) {
                var $element = $(linkNode);
                var isolateScope;

                if (newIsolateScopeDirective) {
                    // 创建完全独立的作用域
                    // isolateScope = scope.$new(true);
                    // $element.addClass('ng-isolate-scope');
                    // $element.data('$isolateScope', isolateScope);

                    initializeDirectiveBindings(
                        scope,
                        attrs,
                        isolateScope,
                        newIsolateScopeDirective.$$bindings.isolateScope,
                        isolateScope
                    );
                }

                if (controllerDirectives) {
                    _.forEach(controllerDirectives, function(directive) {
                        var locals = {
                            // $scope: scope,
                            $scope: directive === newIsolateScopeDirective ? isolateScope : scope,
                            $element: $element,
                            $attrs: attrs
                        };
                        var controllerName = directive.controller;
                        // 外部通过<div my-directive="MyController"></div>，指令配置项对象中通过controller:"@"来使用指令时，MyController将作为该指令的控制器
                        if (controllerName === '@') {
                            controllerName = attrs[directive.name];
                        }
                        // $controller(controllerName, locals, false, directive.controllerAs);
                        controllers[directive.name] = $controller(controllerName, locals, false, directive.controllerAs);
                    });
                }

                // if (controllers[newIsolateScopeDirective.name]) {
                if (newIsolateScopeDirective && controllers[newIsolateScopeDirective.name]) {
                    initializeDirectiveBindings(
                        scope,
                        attrs,
                        controllers[newIsolateScopeDirective.name].instance,
                        newIsolateScopeDirective.$$bindings.isolateScope,
                        isolateScope);
                }

                _.forEach(controllers, function(controller) {
                    controller();
                });

                _.forEach(preLinkFns, function(linkFn) {
                    // linkFn(scope, $element, attrs);
                    linkFn(linkFn.isolateScope ? isolateScope : scope, $element, attrs);
                });

                if (childLinkFn) {
                    childLinkFn(scope, linkNode.childNodes);
                }
                _.forEachRight(postLinkFns, function(linkFn) {
                    // linkFn(scope, $element, attrs);
                    linkFn(linkFn.isolateScope ? isolateScope : scope, $element, attrs);
                });
            }
            function initializeDirectiveBindings(scope, attrs, destination, bindings, isolateScope) {
                // 创建完全独立的作用域
                // isolateScope = scope.$new(true);
                // $element.addClass('ng-isolate-scope');
                // $element.data('$isolateScope', isolateScope);
                _.forEach(newIsolateScopeDirective.$$isolateBindings, function(definition, scopeName) {
                    var attrName = definition.attrName;
                    switch (definition.mode) {
                        case '@':
                            attrs.$observe(attrName, function(newAttrValue) {
                                // isolateScope[scopeName] = newAttrValue;
                                destination[scopeName] = newAttrValue;
                            });
                            if (attrs[attrName]) {
                                // isolateScope[scopeName] = attrs[attrName];
                                destination[scopeName] = attrs[attrName];
                            }
                            break;
                        case '=':
                            if (definition.optional && !attrs[attrName]) {
                                break;
                            }
                            var parentGet = $parse(attrs[attrName]);
                            // var lastValue = isolateScope[scopeName] = parentGet(scope);
                            var lastValue = destination[scopeName] = parentGet(scope);
                            // scope.$watch(parentGet, function(newValue) {
                            //     isolateScope[scopeName] = newValue;
                            // });
                            var parentValueWatch = function() {
                                var parentValue = parentGet(scope);
                                // if (isolateScope[scopeName] !== parentValue) {
                                if (destination[scopeName] !== parentValue) {
                                    if (parentValue !== lastValue) {
                                        // isolateScope[scopeName] = parentValue;
                                        destination[scopeName] = parentValue;
                                    } else {
                                        // parentValue = isolateScope[scopeName];
                                        parentValue = destination[scopeName];
                                        parentGet.assign(scope, parentValue);
                                    }
                                }
                                // return parentValue;
                                lastValue = parentValue;
                                return lastValue;
                            };
                            var unwatch;
                            // scope.$watch(parentValueWatch);
                            if (definition.collection) {
                                unwatch = scope.$watchCollection(attrs[attrName], parentValueWatch);
                            } else {
                                unwatch = scope.$watch(parentValueWatch);
                            }
                            isolateScope.$on('$destroy', unwatch);
                            break;
                        case '&':
                            var parentExpr = $parse(attrs[attrName]);
                            if (parentExpr === _.noop && definition.optional) {
                                break;
                            }
                            // isolateScope[scopeName] = function(locals) {
                            destination[scopeName] = function(locals) {
                                return parentExpr(scope, locals);
                            };
                            break;
                    }
                });
            }
            nodeLinkFn.terminal = terminal;
            nodeLinkFn.scope = newScopeDirective && newScopeDirective.scope;
            return nodeLinkFn;
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
        function groupElementsLinkFnWrapper(linkFn, attrStart, attrEnd) {
            return function(scope, element, attrs) {
                var group = groupScan(element[0], attrStart, attrEnd);
                return linkFn(scope, group, attrs);
            };
        }
        // node是原生DOM对象
        function collectDirectives(node, attrs) {
            var directives = [];
            var match;
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
                    var isNgAttr = /^ngAttr[A-Z]/.test(normalizedAttrName);
                    if (isNgAttr) {
                        // normalizedAttrName =
                        //     normalizedAttrName[6].toLowerCase() +
                        //     normalizedAttrName.substring(7);
                        // 工具方法kebabCase将驼峰形式转换为横划线格式
                        name = _.kebabCase(
                            normalizedAttrName[6].toLowerCase() +
                            normalizedAttrName.substring(7)
                        );
                        normalizedAttrName = directiveNormalize(name.toLowerCase());
                    }
                    attrs.$attr[normalizedAttrName] = name;
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
                    // 对于重复在元素上注册的同名属性，带有ng-attr前缀的属性的值会覆盖不带ng-attr前缀的属性的值
                    if (isNgAttr || !attrs.hasOwnProperty(normalizedAttrName)) {
                        // 将属性及其值扩展到attrs上，进而在$compile方法执行时作为参数传递进去
                        attrs[normalizedAttrName] = attr.value.trim();
                        // 对于值为Boolean类型的属性做处理
                        if (isBooleanAttribute(node, normalizedAttrName)) {
                            attrs[normalizedAttrName] = true;
                        }
                    }
                });
                // 从注册的指令中提取出样式指令
                var className = node.className;
                if (_.isString(className) && !_.isEmpty(className)) {
                    while ((match = /([\d\w\-_]+)(?:\:([^;]+))?;?/.exec(className))) {
                        var normalizedClassName = directiveNormalize(match[1]);
                        if (addDirective(directives, normalizedClassName, 'C')) {
                            attrs[normalizedClassName] = match[2] ? match[2].trim() : undefined;
                        }
                        className = className.substr(match.index + match[0].length);
                    }
                }
                // _.forEach(node.classList, function (cls) {
                //     var normalizedClassName = directiveNormalize(cls);
                //     // addDirective(directives, normalizedClassName, 'C');
                //     // 通过module注册过的directive存到attrs中才有意义
                //     if (addDirective(directives, normalizedClassName, 'C')) {
                //         attrs[normalizedClassName] = undefined;
                //     }
                // });
            } else if (node.nodeType === Node.COMMENT_NODE) {
                // 从注册的指令中提取出注释指令
                // match = /^\s*directive\:\s*([\d\w\-_]+)/.exec(node.nodeValue);
                match = /^\s*directive\:\s*([\d\w\-_]+)\s*(.*)$/.exec(node.nodeValue);
                if (match) {
                    // addDirective(directives, directiveNormalize(match[1]), 'M');
                    var normalizedName = directiveNormalize(match[1]);
                    if (addDirective(directives, normalizedName, 'M')) {
                        attrs[normalizedName] = match[2] ? match[2].trim() : undefined;
                    }
                }
            }
            directives.sort(byPriority);
            return directives;
        }
        function isBooleanAttribute(node, attrName) {
            return BOOLEAN_ATTRS[attrName] && BOOLEAN_ELEMENTS[node.nodeName];
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
            var match;
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
                    match = directive;
                });
            }
            return match;
        }
        return compile;
    }];
}
$CompileProvider.$inject = ['$provide'];