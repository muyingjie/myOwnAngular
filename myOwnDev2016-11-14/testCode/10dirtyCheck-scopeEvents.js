/**
 * Created by yj on 2016/12/22.
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
    this.$$postDigestQueue = [];
    this.$root = this;
    //存放子作用域对象的引用
    this.$$children = [];
    this.$$listeners = {};
    //用于跟踪是否处于脏检测状态
    this.$$phase = null;
}
Scope.prototype.$watch = function (watchFn, listenerFn, valueEq) {
    var self = this;
    var watcher = {
        watchFn: watchFn,
        listenerFn: listenerFn || function() {},
        //对象深层次比较
        valueEq: !!valueEq,
        //为防止和其他值重复，此处放置了一个函数确保其唯一性
        last: initWatchVal
    };
    // this.$$watchers.push(watcher);
    this.$$watchers.unshift(watcher); //为了下面的forEachRight做铺垫
    this.$root.$$lastDirtyWatch = null;
    return function() {
        var index = self.$$watchers.indexOf(watcher);
        if (index >= 0) {
            self.$$watchers.splice(index, 1);
            self.$root.$$lastDirtyWatch = null;
        }
    };
};
Scope.prototype.$digest = function () {
    var ttl = 10;
    var dirty;
    this.$root.$$lastDirtyWatch = null;
    this.$beginPhase("$digest");

    if (this.$root.$$applyAsyncId) {
        clearTimeout(this.$root.$$applyAsyncId);
        this.$$flushApplyAsync();
    }

    do{
        while (this.$$asyncQueue.length) {
            try{
                var asyncTask = this.$$asyncQueue.shift();
                asyncTask.scope.$eval(asyncTask.expression);
            } catch (e) {
                console.error(e);
            }
        }
        dirty = this.$$digestOnce();
        // if(dirty && (!ttl--)){
        if((dirty || this.$$asyncQueue) && (!ttl--)){
            this.$clearPhase();
            throw "脏检测10次之后仍然不稳定";
        }
    }while(dirty || this.$$asyncQueue.length); //加上this.$$asyncQueue.length这个条件的原因是考虑在$watch的第一个参数中向$$asyncQueue里面添加函数的情况，确保其执行，但同时该循环也就成了死循环，因此需要在$$digestOnce完了之后加强判断
    this.$clearPhase();
    while (this.$$postDigestQueue.length) {
        try{
            this.$$postDigestQueue.shift()();
        } catch (e) {
            console.error(e);
        }
    }
};
Scope.prototype.$$digestOnce = function () {
    var self = this;
    var dirty;
    var continueLoop = true;
    this.$$everyScope(function (scope) {
        var newValue;
        var oldValue;
        _.forEachRight(this.$$watchers, function (watcher) {
            try {
                if (watcher) {
                    newValue = watcher.watchFn(scope);
                    oldValue = watcher.last;
                    // if(newValue !== oldValue){
                    if (!scope.$$areEqual(newValue, oldValue, watcher.valueEq)) {
                        self.$root.$$lastDirtyWatch = watcher;
                        // watcher.last = newValue;
                        watcher.last = (watcher.valueEq ? _.clone(newValue) : newValue);
                        watcher.listenerFn(
                            newValue,
                            (oldValue === initWatchVal ? newValue : oldValue),
                            scope
                        );
                        dirty = true;
                    } else if (watcher == self.$root.$$lastDirtyWatch) {
                        continueLoop = false;
                        //在所有watcher全检测为true的前一次如果发现当前watcher就是所有watcher中最后变脏的那个，就可以停止检测了
                        return false;
                    }
                }
            } catch (e) {
                console.error(e);
            }
        });
        return continueLoop;
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
        this.$root.$digest();
    }
};
Scope.prototype.$evalAsync = function (expr) {
    var self = this;
    if (!self.$$phase && !self.$$asyncQueue.length) {
        setTimeout(function() {
            if (self.$$asyncQueue.length) {
                self.$root.$digest();
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
    if (self.$root.$$applyAsyncId === null) {
        self.$root.$$applyAsyncId = setTimeout(function () {
            self.$apply(function () {
                self.$apply(_.bind(self.$$flushApplyAsync, self));
            });
        }, 0);
    }
};
Scope.prototype.$$flushApplyAsync = function() {
    while (this.$$applyAsyncQueue.length) {
        try{
            this.$$applyAsyncQueue.shift()();
        } catch (e) {
            console.error(e);
        }
    }
    this.$root.$$applyAsyncId = null;
};
Scope.prototype.$$postDigest = function(fn) {
    this.$$postDigestQueue.push(fn);
};
Scope.prototype.$new = function(isolated, parent) {
    var child;
    parent = parent || this;
    if (isolated) {
        child = new Scope();
        child.$root = parent.$root;
        child.$$asyncQueue = parent.$$asyncQueue;
        child.$$postDigestQueue = parent.$$postDigestQueue;
        child.$$applyAsyncQueue = parent.$$applyAsyncQueue;
    } else {
        var ChildScope = function() { };
        ChildScope.prototype = this;
        child = new ChildScope();
    }

    parent.$$children.push(child);
    //为防止child调用$digest过程中（即脏检测过程中）遍历父scope的$$watchers，所以为child专门开辟一个$$watchers
    child.$$watchers = [];
    child.$$listeners = {};
    child.$$children = [];
    child.$parent = parent;
    return child;
};
Scope.prototype.$$everyScope = function(fn) {
    if (fn(this)) {
        return this.$$children.every(function(child) {
            return child.$$everyScope(fn);
        });
    } else {
        return false;
    }
};
Scope.prototype.$destroy = function() {
    this.$broadcast('$destroy');
    if (this.$parent) {
        var siblings = this.$parent.$$children;
        var indexOfThis = siblings.indexOf(this);
        if (indexOfThis >= 0) {
            siblings.splice(indexOfThis, 1);
        }
    }
    this.$$watchers = null;
    this.$$listeners = {};
};
Scope.prototype.$on = function(eventName, listener) {
    var listeners = this.$$listeners[eventName];
    if (!listeners) {
        this.$$listeners[eventName] = listeners = [];
    }
    listeners.push(listener);
    return function() {
        var index = listeners.indexOf(listener);
        if (index >= 0) {
            listeners[index] = null;
        }
    };
};
//从当前作用域向上冒泡
Scope.prototype.$emit = function(eventName) {
    var propagationStopped = false;
    // var additionalArgs = _.rest(arguments);
    var event = {
        name: eventName,
        targetScope: this,
        stopPropagation: function() {
            propagationStopped = true;
        },
        preventDefault: function() {
            event.defaultPrevented = true;
        }
    };
    var listenerArgs = [event].concat(_.rest(arguments));
    // return this.$$fireEventOnScope(eventName, additionalArgs);
    var scope = this;
    do {
        event.currentScope = scope;
        scope.$$fireEventOnScope(eventName, listenerArgs);
        scope = scope.$parent;
    } while (scope && !propagationStopped);
    event.currentScope = null;
    return event;
};
//触发当前作用域和子作用域
Scope.prototype.$broadcast = function(eventName) {
    // var additionalArgs = _.rest(arguments);
    var event = {
        name: eventName,
        targetScope: this,
        preventDefault: function() {
            event.defaultPrevented = true;
        }
    };
    var listenerArgs = [event].concat(_.rest(arguments));
    // this.$$fireEventOnScope(eventName, listenerArgs);
    this.$$everyScope(function(scope) {
        event.currentScope = scope;
        scope.$$fireEventOnScope(eventName, listenerArgs);
        return true;
    });
    event.currentScope = null;
    return event;
};
Scope.prototype.$$fireEventOnScope = function(eventName, listenerArgs) {
    var listeners = this.$$listeners[eventName] || [];
    // _.forEach(listeners, function(listener) {
    //     listener(event, listenerArgs);
    // });
    var i = 0;
    while (i < listeners.length) {
        if (listeners[i] === null) {
            listeners.splice(i, 1);
        } else {
            try {
                listeners[i].apply(null, listenerArgs);
            } catch (e) {
                console.error(e);
            }
            i++;
        }
    }
    return event;
};
function initWatchVal() {}