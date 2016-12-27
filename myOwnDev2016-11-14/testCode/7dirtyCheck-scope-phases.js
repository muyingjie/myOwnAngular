/**
 * Created by yj on 2016/12/21.
 */
function Scope(){
    //存放页面中所有的watcher，watcher的来源有：
    //1、手动通过scope对象上$watch方法绑定上去
    this.$$watchers = [];
    //最后一次脏检测检测到的数据不一致的watcher
    this.$$lastDirtyWatch = null;
    //延迟队列
    this.$$asyncQueue = [];
    this.$$applyAsyncQueue = [];
    this.$$applyAsyncId = null;
    //用于跟踪是否处于脏检测状态
    this.$$phase = null;
}
Scope.prototype.$watch = function (watchFn, listenerFn, valueEq) {
    var watcher = {
        watchFn: watchFn,
        listenerFn: listenerFn || function() {},
        //对象深层次比较
        valueEq: !!valueEq,
        //为防止和其他值重复，此处放置了一个函数确保其唯一性
        last: initWatchVal
    };
    this.$$watchers.push(watcher);
    this.$$lastDirtyWatch = null;
};
Scope.prototype.$digest = function () {
    var ttl = 10;
    var dirty;
    this.$$lastDirtyWatch = null;
    this.$beginPhase("$digest");

    if (this.$$applyAsyncId) {
        clearTimeout(this.$$applyAsyncId);
        this.$$flushApplyAsync();
    }

    do{
        while (this.$$asyncQueue.length) {
            var asyncTask = this.$$asyncQueue.shift();
            asyncTask.scope.$eval(asyncTask.expression);
        }
        dirty = this.$$digestOnce();
        // if(dirty && (!ttl--)){
        if((dirty || this.$$asyncQueue) && (!ttl--)){
            this.$clearPhase();
            throw "脏检测10次之后仍然不稳定";
        }
    }while(dirty || this.$$asyncQueue.length); //加上this.$$asyncQueue.length这个条件的原因是考虑在$watch的第一个参数中向$$asyncQueue里面添加函数的情况，确保其执行，但同时该循环也就成了死循环，因此需要在$$digestOnce完了之后加强判断
    this.$clearPhase();
};
Scope.prototype.$$digestOnce = function () {
    var self = this;
    var newValue;
    var oldValue;
    var dirty;
    _.forEach(this.$$watchers, function (watcher) {
        newValue = watcher.watchFn(self);
        oldValue = watcher.last;
        // if(newValue !== oldValue){
        if(!self.$$areEqual(newValue, oldValue, watcher.valueEq)){
            self.$$lastDirtyWatch = watcher;
            // watcher.last = newValue;
            watcher.last = (watcher.valueEq ? _.clone(newValue) : newValue);
            watcher.listenerFn(
                newValue,
                (oldValue === initWatchVal ? newValue : oldValue),
                self
            );
            dirty = true;
        }else if(watcher == self.$$lastDirtyWatch){
            //在所有watcher全检测为true的前一次如果发现当前watcher就是所有watcher中最后变脏的那个，就可以停止检测了
            return false;
        }
    });
    return dirty;
};
Scope.prototype.$$areEqual = function(newValue, oldValue, valueEq) {
    if (valueEq) {
        return _.isEqual(newValue, oldValue);
    } else {
        return newValue === oldValue ||
            (typeof newValue == "number" && typeof oldValue == "number" && isNaN(newValue) && isNaN(oldValue));
    }
};
Scope.prototype.$eval = function (expr, locals) {
    return expr(this, locals);
};
Scope.prototype.$apply = function(expr) {
    try {
        this.$beginPhase("$apply");
        return this.$eval(expr);
    } finally {
        this.$clearPhase();
        this.$digest();
    }
};
Scope.prototype.$evalAsync = function (expr) {
    var self = this;
    if (!self.$$phase && !self.$$asyncQueue.length) {
        setTimeout(function() {
            if (self.$$asyncQueue.length) {
                self.$digest();
            }
        }, 0);
    }
    this.$$asyncQueue.push({
        scope: this, //存储scope属性是为了接下来要实现的scope继承
        expression: expr
    });
};
Scope.prototype.$beginPhase = function (phase) {
    if(this.$$phase){
        throw this.$$phase + ' already in progress.';
    }
    this.$$phase = phase;
};
Scope.prototype.$clearPhase = function() {
    this.$$phase = null;
};
Scope.prototype.$applyAsync = function(expr) {
    var self = this;
    self.$$applyAsyncQueue.push(function() {
        self.$eval(expr);
    });
    if (self.$$applyAsyncId === null) {
        self.$$applyAsyncId = setTimeout(function () {
            self.$apply(function () {
                self.$apply(_.bind(self.$$flushApplyAsync, self));
            });
        }, 0);
    }
};
Scope.prototype.$$flushApplyAsync = function() {
    while (this.$$applyAsyncQueue.length) {
        this.$$applyAsyncQueue.shift()();
    }
    this.$$applyAsyncId = null;
};
function initWatchVal() {}