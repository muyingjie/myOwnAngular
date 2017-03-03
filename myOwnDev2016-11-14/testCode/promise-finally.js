/**
 * Created by lenovo on 2017/1/24.
 */
// finally方法的返回值应该被忽略
// finally里面返回的值不能作为finally后面的then里面回调的实参
this.$get = ["$rootScope", function ($rootScope) {
    function Promise() {
        this.$$state = {};
    }
    // 想要让then链式调用，then就必须返回一个Promise对象才可以
    // 如果返回this，那么所有被绑定的函数在执行的时候所传递的值都是第一次resolve时的值
    // 而且目前规定每个Deferred对象只能resolve一次
    // 因此肯定不能返回this
    // 需要返回一个新的Promise对象
    // 该Promise对象还需要被队列中下一个回调访问到，因此需要放到$$state中
    // 此处放到了$$state的pending数组里面子数组的第一项
    // 此处要注意
    // aaa().then(function(){}).then(function(){})这样链式调用和
    // var def = new Deferred();
    // def.promise.then(function(){});
    // def.promise.then(function(){});这样分开调用 代码内部的处理是截然不同的
    Promise.prototype.then = function(onFulfilled, onRejected) {
        var result = new Deferred();
        this.$$state.pending = this.$$state.pending || [];
        // 异步最后的结果是成功时$$state.status值为1，失败时为2
        // 因此要把成功回调放在数组第二项，失败回调放在第三项
        // 这样方便后期映射处理
        // this.$$state.pending.push([null, onFulfilled, onRejected]);
        this.$$state.pending.push([result, onFulfilled, onRejected]);
        // 如果已经resolve过了，直接进行脏检测循环执行该函数
        if (this.$$state.status > 0) {
            scheduleProcessQueue(this.$$state);
        }
        return result.promise;
    };
    Promise.prototype.catch = function(onRejected) {
        return this.then(null, onRejected);
    };
    Promise.prototype.finally = function(callback) {
        return this.then(function(value) {
            callback();
            return value;
        }, function() {
            callback();
        });
    };
    function Deferred() {
        this.promise = new Promise();
    }
    Deferred.prototype.resolve = function(value) {
        // 只能resolve一次
        if (this.promise.$$state.status) {
            return;
        }
        // 处理value是promise的情况
        if (value && _.isFunction(value.then)) {
            value.then(
                _.bind(this.resolve, this),
                _.bind(this.reject, this)
            );
        } else {
            this.promise.$$state.value = value;
            this.promise.$$state.status = 1;
            scheduleProcessQueue(this.promise.$$state);
        }
    };
    Deferred.prototype.reject = function(reason) {
        if (this.promise.$$state.status) {
            return;
        }
        this.promise.$$state.value = reason;
        this.promise.$$state.status = 2;
        scheduleProcessQueue(this.promise.$$state);
    };
    // 需要在resolve之后的脏检测循环中执行通过then添加的回调
    function scheduleProcessQueue(state) {
        $rootScope.$evalAsync(function() {
            processQueue(state);
        });
    }
    function processQueue(state) {
        // state.pending(state.value);
        // 多次then添加多个回调的处理
        // _.forEach(state.pending, function(onFulfilled) {
        //     onFulfilled(state.value);
        // });
        // 为确保pending队列只执行一次，执行之前先存储一下引用，再干掉它，循环回调队列时用存的引用来循环
        var pending = state.pending;
        delete state.pending;
        _.forEach(pending, function(handlers) {
            var deferred = handlers[0];
            // onFulfilled(state.value);
            var fn = handlers[state.status];
            try {
                if(_.isFunction(fn)) {
                    // fn(state.value);
                    // 执行完fn回调的同时触发then函数返回的deferred
                    deferred.resolve(fn(state.value));
                }
                // 如果绑定回调时是then(null, fn)或者then(fn, null)类型的，做如下处理
                // 注意：此处的deferred并不是第一次调用resolve时的deferred
                // 而是在then函数里创建的deferred
                else if (state.status === 1) {
                    deferred.resolve(state.value);
                } else {
                    deferred.reject(state.value);
                }
            } catch (e) {
                deferred.reject(e);
            }
        });
    }
    function defer() {
        return new Deferred();
    }
    return {
        defer: defer
    };
}];