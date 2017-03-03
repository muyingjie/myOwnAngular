/**
 * Created by lenovo on 2017/2/20-15:59.
 */
// Angular注入的依赖项不必区分顺序，例如下面的例子中计算b的时候用到了a，但是b依然可以在a之前注入：
// var module = angular.module('myModule', []);
// module.provider('b', {
//     $get: function(a) {
//         return a + 2;
//     }
// });
// module.provider('a', {$get: _.constant(1)});
// var injector = createInjector(['myModule']);
// console.log(injector.get('b')); //3
// 达到此效果的原理是延迟加载，经过延迟加载处理之后，只有在通过注入器调用get方法和手动注入的时候才会真正调用
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
        var invokeLater = function(method) {
            return function() {
                invokeQueue.push([method, arguments]);
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
            constant: invokeLater("constant"),
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
// strictDi为true时会禁止函数调用toString方法得到
function createInjector(modulesToLoad, strictDi) {
    // cache用于存储注入器中所有模块上的所有组件计算出的结果，例如constant provider config等等
    // var cache = {};

    var providerCache = {};
    var instanceCache = {};

    // 已经加载过的模块
    var loadedModules = {};

    // 存储循环引用错误路径
    var path = [];

    var $provide = {
        constant: function(key, value) {
            if (key === 'hasOwnProperty') {
                throw 'hasOwnProperty is not a valid constant name!';
            }
            // cache[key] = value;
            instanceCache[key] = value;
        },
        provider: function(key, provider) {
            // cache[key] = provider.$get();

            // var module = angular.module('myModule', []);
            // module.constant('a', 1);
            // module.provider('b', {
            //     $get: function(a) {
            //         return a + 2;
            //     }
            // });
            // var injector = createInjector(['myModule']);
            // // 注入器创建完毕之后，闭包当中的cache就成了
            // // {
            // //     a: 1,
            // //     b: 3
            // // }
            // console.log(injector.get('b')); //3

            // invoke函数里面生成了args作为provider执行的参数列表，provider的参数列表可以获取到注入器中的任何属性，例如a
            // cache[key] = invoke(provider.$get, provider);

            // provider是一个对象，该对象有$get属性
            // providerCache[key + 'Provider'] = provider;

            // provider除了可以是一个对象外，还可以是一个构造函数，但是最终都会被转换为对象，provider构造函数在实例化的过程中还可以注入其他依赖项
            // 由于instantiate函数内部还是调用了invoke函数，invoke内部遇到依赖项时是从providerCache和instanceCache中寻找的，因此这里的依赖项也是这两个缓存变量中的
            // 对于通过传入构造函数来实例化的方式构造函数中的依赖项将不会延迟加载
            // 需要引起注意的是这两种注入方式不一样，它们分别适用于两种场合

            // 在构造函数中注入其他provider，实际上得到的是对应的一个实例
            // 注意：注入provider实例时，必须是aProvider这样的形式而不能是a这样，即必须以Provider结尾
            // var module = angular.module('myModule', []);
            // module.provider('a', function AProvider() {
            //     var value = 1;
            //     this.setValue = function(v) { value = v; };
            //     this.$get = function() { return value; };
            // });
            // module.provider('b', function BProvider(aProvider) {
            //     aProvider.setValue(2);
            //     this.$get = function() { };
            // });
            // var injector = createInjector(['myModule']);
            // console.log(injector.get('a'));
            if (_.isFunction(provider)) {
                provider = instantiate(provider);
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
                    // cache[token];
                    getService(token);
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

    // 通过constants provider注入进来的属性可以通过getService方法得到，getService会先找instanceCache中的内容，再找providerCache中的内容，在providerCache中找到后执行该provider对象上的$get从而得到结果
    function getService(name) {
        if (instanceCache.hasOwnProperty(name)) {
            // 循环依赖出错
            if (instanceCache[name] === INSTANTIATING) {
                // throw new Error('Circular dependency found');
                throw new Error('Circular dependency found: ' +
                    name + ' <- ' + path.join(' <- '));
            }
            return instanceCache[name];
        } else if (providerCache.hasOwnProperty(name)) {
            // 在通过构造函数添加一个provider时(假设该provider的key为a)，直接添加到了providerCache中(加到providerCache中之后key变成了aProvider)，其他的provider构造函数注入该provider时，形式是aProvider这样的类型，查找instanceCache肯定找不到，在找providerCache的时候会在aProvider的基础上往后再附加一个Provider，即aProviderProvider查询，自然也查不到，因此需要在此遍历一遍providerCache来获取到aProvider
            return providerCache[name];
        } else if (providerCache.hasOwnProperty(name + 'Provider')) {
            path.unshift(name);
            // 先用一个空对象填充instanceCache，由于当前获取的name属性值可能在调用invoke的过程中又依赖了其他属性，如果依赖关系又回到了name属性上，则抛出错误
            instanceCache[name] = INSTANTIATING;
            // 避免在获取属性出错的时候在instanceCache中留下垃圾碎片，即当初为了检测循环引用而附上去的INSTANTIATING
            try {
                var provider = providerCache[name + 'Provider'];
                // return invoke(provider.$get, provider);

                // 确保注入进来的每一项都只调用了一次，实例化之后就放到instanceCache中了，下次再get的时候就直接从instanceCache中去取了
                var instance = instanceCache[name] = invoke(provider.$get);
                return instance;
            } finally {
                path.shift();
                if (instanceCache[name] === INSTANTIATING) {
                    delete instanceCache[name];
                }
            }
        }
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
            // return cache.hasOwnProperty(key);
            return instanceCache.hasOwnProperty(key) ||
                providerCache.hasOwnProperty(key + 'Provider');
        },
        // get: function(key) {
        //     return cache[key];
        // },
        get: getService,
        annotate: annotate,
        invoke: invoke,
        instantiate: instantiate
    };
}