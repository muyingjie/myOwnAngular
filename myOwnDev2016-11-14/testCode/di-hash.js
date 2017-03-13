/**
 * Created by lenovo on 2017/2/23-16:07.
 */
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
        // return function(name, requires) {
        return function(name, requires, configFn) {
            // return createModule(name, requires);
            if (requires) {
                return createModule(name, requires, modules, configFn);
            } else {
                return getModule(name, modules);
            }
        };
    });

    var createModule = function(name, requires, modules, configFn) {
        if (name === 'hasOwnProperty') {
            throw 'hasOwnProperty is not a valid module name';
        }
        var invokeQueue = [];
        var configBlocks = [];
        // 当通过constant方法来调用invokeLater时，arrayMethod是unshift
        // var invokeLater = function(method) {
        // var invokeLater = function(method, arrayMethod) {
        // var invokeLater = function(service, method, arrayMethod) {
        var invokeLater = function(service, method, arrayMethod, queue) {
            return function() {
                // invokeQueue.push([method, arguments]);
                // invokeQueue[arrayMethod || 'push']([method, arguments]);

                // var item = [service, method, arguments];
                // invokeQueue[arrayMethod || 'push'](item);

                // 通过config进来的注入项必须在所有注入项执行完毕之后再执行
                queue = queue || invokeQueue;
                queue[arrayMethod || 'push']([service, method, arguments]);
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

            // constant: invokeLater("constant", "unshift"),
            // provider: invokeLater("provider"),

            constant: invokeLater('$provide', 'constant', 'unshift'),
            provider: invokeLater('$provide', 'provider'),
            factory: invokeLater('$provide', 'factory'),
            value: invokeLater('$provide', 'value'),
            service: invokeLater('$provide', 'service'),
            decorator: invokeLater('$provide', 'decorator'),
            config: invokeLater('$injector', 'invoke', 'push', configBlocks),
            //在
            run: function(fn) {
                moduleInstance._runBlocks.push(fn);
                return moduleInstance;
            },
            _invokeQueue: invokeQueue,
            _configBlocks: configBlocks,
            _runBlocks: []
        };

        if (configFn) {
            moduleInstance.config(configFn);
        }

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
    var path = [];
    strictDi = (strictDi === true);

    var providerCache = {};
    // 对应第二种注入器
    var providerInjector = providerCache.$injector = createInternalInjector(providerCache, function() {
        throw 'Unknown provider: '+path.join(' <- ');
    });

    var instanceCache = {};
    // 对应第一种注入器
    // 把$injector添加进instanceCache中
    var instanceInjector = instanceCache.$injector = createInternalInjector(instanceCache, function(name) {
        var provider = providerInjector.get(name + 'Provider');
        return instanceInjector.invoke(provider.$get, provider);
    });

    function enforceReturnValue(factoryFn) {
        return function() {
            var value = instanceInjector.invoke(factoryFn);
            if (_.isUndefined(value)) {
                throw 'factory must return a value';
            }
            return value;
        };
    }

    // var $provide = { // 将$provide挂在providerCache上，这样在外部调用provider方法传入一个构造函数时可以在函数参数中注入$provide
    providerCache.$provide = {
        constant: function(key, value) {
            if (key === 'hasOwnProperty') {
                throw 'hasOwnProperty is not a valid constant name!';
            }
            providerCache[key] = value;
            instanceCache[key] = value;
        },
        provider: function(key, provider) {
            if (_.isFunction(provider)) {
                // provider = instantiate(provider);
                provider = providerInjector.instantiate(provider);
            }
            providerCache[key + 'Provider'] = provider;
        },
        // factory: function(key, factoryFn) {
        // enforce代表是否必须有返回值
        factory: function(key, factoryFn, enforce) {
            // this.provider(key, {$get: factoryFn});
            // 强迫factoryFn有返回值，只有factoryFn有了返回值injector.get(key)才会有值
            this.provider(key, {$get: enforce === false ? factoryFn : enforceReturnValue(factoryFn)});
        },
        value: function(key, value) {
            // this.factory(key, _.constant(value));
            // value可以没有返回值
            this.factory(key, _.constant(value), false);
        },
        service: function(key, Constructor) {
            this.factory(key, function() {
                return instanceInjector.instantiate(Constructor);
            });
        },
        decorator: function(serviceName, decoratorFn) {
            var provider = providerInjector.get(serviceName + 'Provider');
            var original$get = provider.$get;
            provider.$get = function() {
                var instance = instanceInjector.invoke(original$get, provider);
                instanceInjector.invoke(decoratorFn, null, {$delegate: instance});
                return instance;
            };
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

    function runInvokeQueue(queue) {
        _.forEach(queue, function(invokeArgs) {
            // var method = invokeArgs[0];
            // var args = invokeArgs[1];
            // providerCache.$provide[method].apply(providerCache.$provide, args);

            var service = providerInjector.get(invokeArgs[0]);
            var method = invokeArgs[1];
            var args = invokeArgs[2];
            service[method].apply(service, args);
        });
    }

    var runBlocks = [];
    // var loadedModules = {};
    var loadedModules = new HashMap();
    // _.forEach(modulesToLoad, function loadModule(moduleName) {
    //     if (!loadedModules.hasOwnProperty(moduleName)) {
    //         loadedModules[moduleName] = true;
    //         var module = angular.module(moduleName);
    //         _.forEach(module.requires, loadModule);
    //         runInvokeQueue(module._invokeQueue);
    //         runInvokeQueue(module._configBlocks);
    //         // 在创建注入器的时候就执行run队列
    //         runBlocks = runBlocks.concat(module._runBlocks);
    //     }
    // });
    _.forEach(modulesToLoad, function loadModule(module) {
        if (!loadedModules.get(module)) {
            loadedModules.put(module, true);
            if (_.isString(module)) {
                    module = angular.module(module);
                    _.forEach(module.requires, loadModule);
                    runInvokeQueue(module._invokeQueue);
                    runInvokeQueue(module._configBlocks);
                    runBlocks = runBlocks.concat(module._runBlocks);
            } else if(_.isFunction(module) || _.isArray(module)){
                // providerInjector.invoke(module);
                runBlocks.push(providerInjector.invoke(module));
            }
        }
    });
    // 所有模块加载完成之后再执行run队列
    // _.forEach(runBlocks, function(runBlock) {
    _.forEach(_.compact(runBlocks), function(runBlock) {
        instanceInjector.invoke(runBlock);
    });

    return instanceInjector;
}

//hash
function hashKey(value) {
    var type = typeof value;
    var uid;
    if (type === 'function' ||
        (type === 'object' && value !== null)) {
        uid = value.$$hashKey;
        if (typeof uid === 'function') {
            uid = value.$$hashKey();
        } else if (uid === undefined) {
            uid = value.$$hashKey = _.uniqueId();
        }
    } else {
        uid = value;
    }
    return type + ':' + uid;
}

function HashMap() {
}
HashMap.prototype = {
    put: function(key, value) {
        this[hashKey(key)] = value;
    },
    get: function(key) {
        return this[hashKey(key)];
    },
    remove: function(key) {
        key = hashKey(key);
        var value = this[key];
        delete this[key];
        return value;
    }
};