_.mixin({
    isArrayLike: function (obj) {
        if (_.isNull(obj) || _.isUndefined(obj)) {
            return false;
        }
        var len = obj.length;
        return len === 0 || (_.isNumber(len) && length > 0 && (length - 1) in obj);
    }
});