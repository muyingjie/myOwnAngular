/**
 * Created by lenovo on 2017/1/22.
 */
this.$get = ["$rootScope", function ($rootScope) {
    function Promise() {
        this.$$state = {};
    }
    Promise.prototype.then = function(onFulfilled, onRejected) {
        this.$$state.pending = this.$$state.pending || [];
        // 异步最后的结果是成功时$$state.status值为1，失败时为2
        // 因此要把成功回调放在数组第二项，失败回调放在第三项
        // 这样方便后期映射处理
        this.$$state.pending.push([null, onFulfilled, onRejected]);
        //如果已经resolve过了，直接进行脏检测循环执行该函数
        if (this.$$state.status > 0) {
            scheduleProcessQueue(this.$$state);
        }
    };
    Promise.prototype.catch = function(onRejected) {
        return this.then(null, onRejected);
    };
    Promise.prototype.finally = function(callback) {
        return this.then(function() {
            callback();
        }, function() {
            callback();
        });
    };
    function Deferred() {
        this.promise = new Promise();
    }
    Deferred.prototype.resolve = function(value) {
        //只能resolve一次
        if (this.promise.$$state.status) {
            return;
        }
        // this.promise.$$state.pending(value);
        this.promise.$$state.value = value;
        this.promise.$$state.status = 1;
        scheduleProcessQueue(this.promise.$$state);
    };
    Deferred.prototype.reject = function(reason) {
        if (this.promise.$$state.status) {
            return;
        }
        this.promise.$$state.value = reason;
        this.promise.$$state.status = 2;
        scheduleProcessQueue(this.promise.$$state);
    };
    //需要在resolve之后的脏检测循环中执行通过then添加的回调
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
            // onFulfilled(state.value);
            var fn = handlers[state.status];
            if(_.isFunction(fn)){
                fn(state.value);
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