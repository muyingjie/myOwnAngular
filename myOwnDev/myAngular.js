(function () {
    function Scope() {
        //双$符号代表是私有属性
        this.$$watchers = [];
        this.$$lastDirtyWatch = null;
    }
    Scope.prototype.$watch = function (watchFn, listenerFn) {
        var watcher = {
            watchFn: watchFn,
            listenerFn: listenerFn || function () { },
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
            if (newValue !== oldValue) {
                self.$$lastDirtyWatch = watcher;
                watcher.last = newValue;
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
        do {
            dirty = this.$$digestOnce();
            if (dirty && !(ttl--)) {
                throw "10 digest iterations reached";
            }
        } while (dirty);
    };

    function initWatchVal() { }

    window.Scope = Scope;
})();
