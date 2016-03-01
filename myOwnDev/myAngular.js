(function () {
    function Scope() {
        //双$符号代表是私有属性
        this.$$watchers = [];
        this.$$lastDirtyWatch = null;
        this.$$asyncQueue = [];
        this.$$applyAsyncQueue = [];
        this.$$applyAsyncId = null;
        this.$$postDigestQueue = [];
        this.$root = this;
        this.$$children = [];
        this.$$phase = null;
    }
    Scope.prototype.$watch = function (watchFn, listenerFn, valueEq) {
        var self = this;
        var watcher = {
            watchFn: watchFn,
            listenerFn: listenerFn || function () { },
            valueEq: !!valueEq,
            last: initWatchVal
        };
        this.$$watchers.unshift(watcher);
        this.$root.$$lastDirtyWatch = null;
        return function () {
            var index = self.$$watchers.indexOf(watcher);
            if (index >= 0) {
                self.$$watchers.splice(index, 1);
                //防止在$digestOnce中遍历所有的watcher时其中某一个watcher的listener中删掉其他watcher的情况
                self.$root.$$lastDirtyWatch = null;
            }
        };
    };
    Scope.prototype.$$digestOnce = function () {
        var self = this;
        var dirty;
        var continueLoop = true;
        this.$$everyScope(function (scope) {
            var newValue;
            var oldValue;
            _.forEachRight(scope.$$watchers, function (watcher) {
                try {
                    //判断watcher是否存在是因为有可能在$digest循环watcher的过程中某一个watcher在其监听函数中会将所有的this.$$watchers里面所有的watcher全部删掉
                    if (watcher) {
                        newValue = watcher.watchFn(scope);
                        oldValue = watcher.last;
                        //if (newValue !== oldValue) {
                        if (!scope.$$areEqual(newValue, oldValue, watcher.valueEq)) {
                            self.$root.$$lastDirtyWatch = watcher;
                            //watcher.last = newValue;
                            watcher.last = watcher.valueEq ? _.cloneDeep(newValue) : newValue;
                            watcher.listenerFn(
                                newValue,
                                (oldValue == initWatchVal ? newValue : oldValue),
                                scope
                            );
                            dirty = true;
                        } else if (self.$root.$$lastDirtyWatch === watcher) {
                            continueLoop = false;
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
    Scope.prototype.$digest = function () {
        var ttl = 10;//ttl means Time To Live
        var dirty;
        this.$root.$$lastDirtyWatch = null;
        this.$beginPhase("$digest");

        if (this.$root.$$applyAsyncId) {
            clearTimeout(this.$root.$$applyAsyncId);
            this.$$flushApplyAsync();
        }

        do {
            while (this.$$asyncQueue.length) {
                try {
                    var asyncTask = this.$$asyncQueue.shift();
                    asyncTask.scope.$eval(asyncTask.expression);
                } catch (e) {
                    console.error(e);
                }
            }
            dirty = this.$$digestOnce();
            if ((dirty || this.$$asyncQueue.length) && !(ttl--)) {
                this.$clearPhase();
                throw "10 digest iterations reached";
            }
        } while (dirty || this.$$asyncQueue.length);
        this.$clearPhase();

        while (this.$$postDigestQueue.length) {
            try {
                this.$$postDigestQueue.shift()();
            } catch (e) {
                console.error(e);
            }
        }
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
            this.$root.$digest();
        }
    };
    Scope.prototype.$evalAsync = function (expr) {
        var self = this;
        if (!self.$$phase && !self.$$asyncQueue.length) {
            setTimeout(function () {
                if (self.$$asyncQueue.length) {
                    self.$root.$digest();
                }
            }, 0);
        }
        self.$$asyncQueue.push({
            scope: self,
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
        if (self.$root.$$applyAsyncId === null) {
            self.$root.$$applyAsyncId = setTimeout(function () {
                //self.$apply(function () {
                //    while (self.$$applyAsyncQueue.length) {
                //        self.$$applyAsyncQueue.shift()();
                //    }
                //    self.$$applyAsyncId = null;
                //});
                //_.bind() 第一个参数是要绑定的函数，第二个参数是函数里面的this指向
                self.$apply(_.bind(self.$$flushApplyAsync, self));
            }, 0);
        }
    };
    Scope.prototype.$$flushApplyAsync = function () {
        while (this.$$applyAsyncQueue.length) {
            try {
                this.$$applyAsyncQueue.shift()();
            } catch (e) {
                console.error(e);
            }
        }
        this.$root.$$applyAsyncId = null;
    };
    Scope.prototype.$$postDigest = function (fn) {
        this.$$postDigestQueue.push(fn);
    };
    Scope.prototype.$watchGroup = function (watchFns, listenerFn) {
        var self = this;
        var newValues = new Array(watchFns.length);
        var oldValues = new Array(watchFns.length);
        var changeReactionScheduled = false;
        var firstRun = true;

        if (watchFns.length === 0) {
            var shouldCall = true;
            self.$evalAsync(function () {
                if (shouldCall) {
                    listenerFn(newValues, newValues, self);
                }
            });
            return function () {
                shouldCall = false;
            };
        }

        function watchGroupListener() {
            if (firstRun) {
                firstRun = false;
                listenerFn(newValues, newValues, self);
            } else {
                listenerFn(newValues, oldValues, self);
            }
            changeReactionScheduled = false;
        }

        var destroyFunctions = _.map(watchFns, function (watchFn, i) {
            return self.$watch(watchFn, function (newValue, oldValue) {
                newValues[i] = newValue;
                oldValues[i] = oldValue;
                if (!changeReactionScheduled) {
                    changeReactionScheduled = true;
                    self.$evalAsync(watchGroupListener);
                }
            });
        });

        return function () {
            _.forEach(destroyFunctions, function (destroyFunction) {
                destroyFunction();
            });
        };
    };

    //Scope Inheritance
    Scope.prototype.$new = function (isolated, parent) {
        var child;
        parent = parent || this;
        if (isolated) {
            child = new Scope();
            child.$root = parent.$root;
            child.$$asyncQueue = parent.$$asyncQueue;
            child.$$postDigestQueue = parent.$$postDigestQueue;
            child.$$applyAsyncQueue = parent.$$applyAsyncQueue;
        } else {
            var ChildScope = function () { };
            ChildScope.prototype = this;
            child = new ChildScope();
        }
        parent.$$children.push(child);
        child.$$watchers = [];
        child.$$children = [];
        child.$parent = parent;
        return child;
    };

    Scope.prototype.$$everyScope = function (fn) {
        if (fn(this)) {
            return this.$$children.every(function (child) {
                return child.$$everyScope(fn);
            });
        } else {
            return false;
        }
    };

    Scope.prototype.$destroy = function () {
        if (this.$parent) {
            var siblings = this.$parent.$$children;
            var indexOfThis = siblings.indexOf(this);
            if (indexOfThis >= 0) {
                siblings.splice(indexOfThis, 1);
            }
        }
        this.$$watchers = null;
    };

    Scope.prototype.$watchCollection = function (watchFn, listenerFn) {
        var self = this;
        var newValue;
        var oldValue;
        var oldLength;
        var veryOldValue;
        var trackVeryOldValue = (listenerFn.length > 1);
        var changeCount = 0;
        var firstRun = true;

        var internalWatchFn = function (scope) {
            var newLength;
            newValue = watchFn(scope);

            if (_.isObject(newValue)) {
                if (_.isArrayLike(newValue)) {
                    if (!_.isArray(oldValue)) {
                        changeCount++;
                        oldValue = [];
                    }
                    if (newValue.length !== oldValue.length) {
                        changeCount++;
                        oldValue.length = newValue.length;
                    }
                    _.forEach(newValue, function (newItem, i) {
                        var bothNaN = _.isNaN(newItem) && _.isNaN(oldValue[i]);
                        if (!bothNaN && newItem !== oldValue[i]) {
                            changeCount++;
                            oldValue[i] = newItem;
                        }
                    });
                } else {
                    if (!_.isObject(oldValue) || _.isArrayLike(oldValue)) {
                        changeCount++;
                        oldValue = {};
                        oldLength = 0;
                    }
                    newLength = 0;
                    _.forOwn(newValue, function (newVal, key) {
                        newLength++;
                        if (oldValue.hasOwnProperty(key)) {
                            var bothNaN = _.isNaN(newVal) && _.isNaN(oldValue[key]);
                            if (!bothNaN && oldValue[key] !== newVal) {
                                changeCount++;
                                oldValue[key] = newVal;
                            }
                        } else {
                            changeCount++;
                            oldLength++;
                            oldValue[key] = newVal;
                        }
                    });
                    //到目前newLength记录newValue里面属性总数
                    //oldLength记录oldValue里面没有的newValue中的属性
                    if (oldLength > newLength) {
                        changeCount++;
                        _.forOwn(oldValue, function (oldVal, key) {
                            if (!newValue.hasOwnProperty(key)) {
                                oldLength--;
                                delete oldValue[key];
                            }
                        });
                    }
                }
            } else {
                if (!self.$$areEqual(newValue, oldValue, false)) {
                    changeCount++;
                }
                oldValue = newValue;
            }

            return changeCount;
        };

        var internalListenerFn = function () {
            if (firstRun) {
                listenerFn(newValue, newValue, self);
                firstRun = false;
            } else {
                listenerFn(newValue, oldValue, self);
            }

            if (trackVeryOldValue) {
                veryOldValue = _.clone(newValue);
            }
        };

        return this.$watch(internalWatchFn, internalListenerFn);
    };

    function initWatchVal() { }

    window.Scope = Scope;
})();
