(function () {
    function Scope() {
        //双$符号代表是私有属性
        this.$$watchers = [];
        this.$$lastDirtyWatch = null;
        this.$$asyncQueue = [];
        this.$$applyAsyncQueue = [];
        this.$$applyAsyncId = null;
        this.$$phase = null;
    }
    Scope.prototype.$watch = function (watchFn, listenerFn, valueEq) {
        var watcher = {
            watchFn: watchFn,
            listenerFn: listenerFn || function () { },
            valueEq: !!valueEq,
            last: initWatchVal
        };
        this.$$watchers.push(watcher);
        this.$$lastDirtyWatch = null;
    };
    Scope.prototype.$$digestOnce = function () {
        var self = this;
        var newValue;
        var oldValue;
        var dirty;
        _.forEach(this.$$watchers, function (watcher) {
            newValue = watcher.watchFn(self);
            oldValue = watcher.last;
            //if (newValue !== oldValue) {
            if (!self.$$areEqual(newValue, oldValue, watcher.valueEq)) {
                self.$$lastDirtyWatch = watcher;
                //watcher.last = newValue;
                watcher.last = watcher.valueEq ? _.cloneDeep(newValue) : newValue;
                watcher.listenerFn(
                    newValue,
                    (oldValue == initWatchVal ? newValue : oldValue),
                    self
                );
                dirty = true;
            } else if (self.$$lastDirtyWatch === watcher) {
                return false;
            }
        });
        return dirty;
    };
    Scope.prototype.$digest = function () {
        var ttl = 10;//ttl means Time To Live
        var dirty;
        this.$$lastDirtyWatch = null;
        this.$beginPhase("$digest");
        do {
            while (this.$$asyncQueue.length) {
                var asyncTask = this.$$asyncQueue.shift();
                asyncTask.scope.$eval(asyncTask.expression);
            }
            dirty = this.$$digestOnce();
            if ((dirty || this.$$asyncQueue.length) && !(ttl--)) {
                this.$clearPhase();
                throw "10 digest iterations reached";
            }
        } while (dirty || this.$$asyncQueue.length);
        this.$clearPhase();
    };
    Scope.prototype.$$areEqual = function (newValue, oldValue, valueEq) {
        if (valueEq) {
            return _.isEqual(newValue, oldValue);
        } else {
            return newValue === oldValue || (
                typeof newValue === "number" &&
                typeof oldValue === "number" &&
                isNaN(newValue) &&
                isNaN(oldValue)
            );
        }
    };
    Scope.prototype.$eval = function (expr, locals) {
        return expr(this, locals);
    };
    Scope.prototype.$apply = function (expr) {
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
            setTimeout(function () {
                if (self.$$asyncQueue.length) {
                    self.$digest();
                }
            }, 0);
        }
        this.$$asyncQueue.push({
            scope: this,
            expression: expr
        });
    };
    Scope.prototype.$beginPhase = function (phase) {
        if (this.$$phase) {
            throw this.$$phase + " already in progress";
        }
        this.$$phase = phase;
    };
    Scope.prototype.$clearPhase = function () {
        this.$$phase = null;
    };
    Scope.prototype.$applyAsync = function (expr) {
        var self = this;
        self.$$applyAsyncQueue.push(function () {
            self.$eval(expr);
        });
        if (self.$$applyAsyncId === null) {
            self.$$applyAsyncId = setTimeout(function () {
                //self.$apply(function () {
                //    while (self.$$applyAsyncQueue.length) {
                //        self.$$applyAsyncQueue.shift()();
                //    }
                //    self.$$applyAsyncId = null;
                //});
                self.$apply(_.bind(self.$$flushApplyAsync, self));
            }, 0);
        }
    };
    Scope.prototype.$$flushApplyAsync = function () {
        while (this.$$applyAsyncQueue) {
            this.$$applyAsyncQueue.shift()();
        }
        this.$$applyAsyncId = null;
    };

    function initWatchVal() { }

    window.Scope = Scope;
})();
