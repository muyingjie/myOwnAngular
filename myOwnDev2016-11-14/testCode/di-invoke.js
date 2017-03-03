/**
 * Created by lenovo on 2017/2/17.
 */
// 注入器可以通过invoke来调用函数
// var module = angular.module('myModule', []);
// module.constant('a', 1);
// module.constant('b', 2);
// var injector = createInjector(['myModule']);
// var fn = function(one, two) { return one + two; };
// fn.$inject = ['a', 'b'];
// console.log(injector.invoke(fn));
// loader.js
function setupModuleLoader(window) {
    // var angular = window.angular = {};
    // 确保在一个window下只有一个angular全局变量
    // var angular = (window.angular = window.angular || {});
    // 由于后期会多次使用这种模式（在一个window下如果有我们想要的属性，就用它），因此将其封装成函数
    var ensure = function(obj, name, factory) {
        return obj[name] || (obj[name] = factory());
    };
    var angular = ensure(window, 'angular', Object);

    // 确保在angular对象上使用的module是同一个
    ensure(angular, 'module', function() {
        var modules = {};
        return function(name, requires) {
            // return createModule(name, requires);
            if (requires) {
                return createModule(name, requires, modules);
            } else {
                return getModule(name, modules);
            }
        };
    });

    var createModule = function(name, requires, modules) {
        if (name === 'hasOwnProperty') {
            throw 'hasOwnProperty is not a valid module name';
        }
        var invokeQueue = [];
        var moduleInstance = {
            name: name,
            requires: requires,
            constant: function(key, value) {
                invokeQueue.push(['constant', [key, value]]);
            },
            _invokeQueue: invokeQueue
        };
        modules[name] = moduleInstance;
        return moduleInstance;
    };

    var getModule = function(name, modules) {
        // return modules[name];
        if (modules.hasOwnProperty(name)) {
            return modules[name];
        } else {
            throw 'Module '+name+' is not available!';
        }
    };
}

// injector.js
var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
// 将FN_ARGS匹配到的数组再次进行处理除掉空格
// var FN_ARG = /^\s*(\S+)\s*$/;
// Angular允许出现_aaa_这样两头都带下划线的参数，而且这些下划线最终会被去掉
var FN_ARG = /^\s*(_?)(\S+?)\1\s*$/;
// 该正则用于去掉形参中加了注释的部分
// var STRIP_COMMENTS = /\/\*.*\*\//;
// var STRIP_COMMENTS = /\/\*.*?\*\//g;
// 去掉"//"类型的注释
var STRIP_COMMENTS = /(\/\/.*$)|(\/\*.*?\*\/)/mg;
// strictDi为true时会禁止函数调用toString方法得到
function createInjector(modulesToLoad, strictDi) {
    var cache = {};
    // 已经加载过的模块
    var loadedModules = {};

    var $provide = {
        constant: function(key, value) {
            if (key === 'hasOwnProperty') {
                throw 'hasOwnProperty is not a valid constant name!';
            }
            cache[key] = value;
        }
    };

    // annotate用于得到注入的参数
    // 普通函数通过为其添加$inject来扩展
    // var injector = createInjector([]);
    // var fn = function() { };
    // fn.$inject = ['a', 'b'];
    // console.log(injector.annotate(fn)); //['a', 'b']

    // 用数组的方式注入
    // var injector = createInjector([]);
    // var fn = ['a', 'b', function() { }];
    // console.log(injector.annotate(fn)); //['a', 'b']

    // 直接从函数的形参中获取，调用toString得到函数字符串再通过正则匹配
    // var injector = createInjector([]);
    // var fn = function(a, b) { };
    // console.log(injector.annotate(fn)); //['a', 'b']

    // function annotate(fn) {
    //     return fn.$inject;
    // }

    // function annotate(fn) {
    //     if (_.isArray(fn)) {
    //         return fn.slice(0, fn.length - 1);
    //     } else {
    //         return fn.$inject;
    //     }
    // }

    // function annotate(fn) {
    //     if (_.isArray(fn)) {
    //         return fn.slice(0, fn.length - 1);
    //     } else if (fn.$inject) {
    //         return fn.$inject;
    //     } else {
    //         return [];
    //     }
    // }

    function annotate(fn) {
        if (_.isArray(fn)) {
            return fn.slice(0, fn.length - 1);
        } else if (fn.$inject) {
            return fn.$inject;
        } else if (!fn.length) {
            return [];
        } else {
            if (strictDi) {
                throw 'fn is not using explicit annotation and '+
                'cannot be invoked in strict mode';
            }
            // var argDeclaration = fn.toString().match(FN_ARGS);
            // 去掉被注释的参数
            var source = fn.toString().replace(STRIP_COMMENTS, '');
            var argDeclaration = source.match(FN_ARGS);

            // return argDeclaration[1].split(',');
            // 抛去了第0项，第0项是整体匹配结果
            return _.map(argDeclaration[1].split(','), function(argName) {
                // return argName.match(FN_ARG)[1];
                return argName.match(FN_ARG)[2];
            });
        }
    }

    // function invoke(fn) {
    // function invoke(fn, self) {
        // locals可以理解为fn参数的默认值，在fn函数被调用时，会先寻找locals中有没有该参数，例如：
        // var module = angular.module('myModule', []);
        // module.constant('a', 1);
        // module.constant('b', 2);
        // var injector = createInjector(['myModule']);
        // var fn = function(one, two) { return one + two; };
        // fn.$inject = ['a', 'b'];
        // console.log(injector.invoke(fn, undefined, {b: 3}));
    function invoke(fn, self, locals) {
        // var args = _.map(fn.$inject, function(token) {
        var args = _.map(annotate(fn), function(token) {
            if (_.isString(token)) {
                // return cache[token];
                return locals && locals.hasOwnProperty(token) ?
                    locals[token] :
                    cache[token];
            } else {
                throw 'Incorrect injection token! Expected a string, got '+token;
            }
        });
        if (_.isArray(fn)) {
            fn = _.last(fn);
        }
        // return fn.apply(null, args);
        return fn.apply(self, args);
    }

    _.forEach(modulesToLoad, function loadModule(moduleName) {
        if (!loadedModules.hasOwnProperty(moduleName)) {
            loadedModules[moduleName] = true;
            var module = angular.module(moduleName);
            _.forEach(module.requires, loadModule);
            _.forEach(module._invokeQueue, function(invokeArgs) {
                var method = invokeArgs[0];
                var args = invokeArgs[1];
                $provide[method].apply($provide, args);
            });
        }
    });

    // 依赖注入实现对象实例化
    // var module = angular.module('myModule', []);
    // module.constant('a', 1);
    // module.constant('b', 2);
    // var injector = createInjector(['myModule']);
    // function Type(a, b) {
    //     this.result = a + b;
    // }
    // var instance = injector.instantiate(Type);
    // console.log(instance.result); // 3
    function instantiate(Type, locals) {
        // var instance = {};
        var UnwrappedType = _.isArray(Type) ? _.last(Type) : Type;
        // 外部通过构造函数访问时需返回实例
        var instance = Object.create(UnwrappedType.prototype);
        invoke(Type, instance, locals);
        return instance;
    }

    return {
        has: function(key) {
            return cache.hasOwnProperty(key);
        },
        get: function(key) {
            return cache[key];
        },
        annotate: annotate,
        invoke: invoke,
        instantiate: instantiate
    };
}