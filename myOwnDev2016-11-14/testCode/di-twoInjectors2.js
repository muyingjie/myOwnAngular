/**
 * Created by lenovo on 2017/2/20-17:19.
 */
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
        // 当通过constant方法来调用invokeLater时，arrayMethod是unshift
        // var invokeLater = function(method) {
        var invokeLater = function(method, arrayMethod) {
            return function() {
                // invokeQueue.push([method, arguments]);
                invokeQueue[arrayMethod || 'push']([method, arguments]);
                return moduleInstance;
            };
        };
        var moduleInstance = {
            name: name,
            requires: requires,
            // constant: function(key, value) {
            //     invokeQueue.push(['constant', [key, value]]);
            // },
            // provider: function(key, provider) {
            //     invokeQueue.push(['provider', [key, provider]]);
            // },
            constant: invokeLater("constant", "unshift"),
            provider: invokeLater("provider"),
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
// 存储正在构造的对象
var INSTANTIATING = { };
// 1、第一种注入：provider构造函数参数的注入：只能注入provider类型，不能注入普通类型
// 2、第二种注入：provider对象或provider函数中$get方法参数的注入：只能注入普通类型，不能注入provider类型
// 我们可以创建两种注入器来支持这两种类型
// 接下来我们重构一下代码
// 通过constant的注入项需要放在通过provider注入的前面
function createInjector(modulesToLoad, strictDi) {
    var loadedModules = {};
    var path = [];
    strictDi = (strictDi === true);

    var providerCache = {};
    // 对应第二种注入器
    var providerInjector = createInternalInjector(providerCache, function() {
        throw 'Unknown provider: '+path.join(' <- ');
    });

    var instanceCache = {};
    // 对应第一种注入器
    var instanceInjector = createInternalInjector(instanceCache, function(name) {
        var provider = providerInjector.get(name + 'Provider');
        return instanceInjector.invoke(provider.$get, provider);
    });
    var $provide = {
        constant: function(key, value) {
            if (key === 'hasOwnProperty') {
                throw 'hasOwnProperty is not a valid constant name!';
            }
            providerCache[key] = value;
            instanceCache[key] = value;
        },
        // provider期待接受一个含有$get方法的对象，如果provider接受到的是一个构造函数，该函数的实例化对象中应该有$get方法，在此用instantiate方法实例化它
        provider: function(key, provider) {
            if (_.isFunction(provider)) {
                // provider = instantiate(provider);
                provider = providerInjector.instantiate(provider);
            }
            providerCache[key + 'Provider'] = provider;
        }
    };

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

    // getService函数中，在从cache中获取不到值的时候，由factoryFn来完成获取
    function createInternalInjector(cache, factoryFn) {
        function getService(name) {
            if (cache.hasOwnProperty(name)) {
                if (cache[name] === INSTANTIATING) {
                    throw new Error('Circular dependency found: ' +
                        name + ' <- ' + path.join(' <- '));
                }
                return cache[name];
            } else {
                path.unshift(name);
                cache[name] = INSTANTIATING;
                try {
                    return (cache[name] = factoryFn(name));
                } finally {
                    path.shift();
                    if (cache[name] === INSTANTIATING) {
                        delete cache[name];
                    }
                }
            }
        }

        function invoke(fn, self, locals) {
            var args = annotate(fn).map(function(token) {
                if (_.isString(token)) {
                    return locals && locals.hasOwnProperty(token) ?
                        locals[token] :
                        getService(token);
                } else {
                    throw 'Incorrect injection token! Expected a string, got '+token;
                }
            });
            if (_.isArray(fn)) {
                fn = _.last(fn);
            }
            return fn.apply(self, args);
        }

        function instantiate(Type, locals) {
            var instance = Object.create((_.isArray(Type) ? _.last(Type) : Type).prototype);
            invoke(Type, instance, locals);
            return instance;
        }

        // 注入器对象
        return {
            has: function(name) {
                return cache.hasOwnProperty(name) ||
                    providerCache.hasOwnProperty(name + 'Provider');
            },
            get: getService,
            annotate: annotate,
            invoke: invoke,
            instantiate: instantiate
        };
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

    return instanceInjector;
}