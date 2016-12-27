/**
 * Created by yj on 2016/12/19.
 */
//注意digestOnce的时候每次给watcher的last属性赋值时也需要深拷贝一份出来
//同时还要考虑排除NaN的情况
function Scope(){
    //存放页面中所有的watcher，watcher的来源有：
    //1、手动通过scope对象上$watch方法绑定上去
    this.$$watchers = [];
    //最后一次脏检测检测到的数据不一致的watcher
    this.$$lastDirtyWatch = null;
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
    do{
        dirty = this.$$digestOnce();
        if(dirty && (!ttl--)){
            throw "脏检测10次之后仍然不稳定";
        }
    }while(dirty);
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
function initWatchVal() {}
//===============================================================
//对象脏检测
scope.aValue = [1, 2, 3];
scope.counter = 0;
scope.$watch(
    function(scope) { return scope.aValue; },
    function(newValue, oldValue, scope) {
        scope.counter++;
    },
    true
);
scope.$digest();
expect(scope.counter).toBe(1);
scope.aValue.push(4);
scope.$digest();
expect(scope.counter).toBe(2);