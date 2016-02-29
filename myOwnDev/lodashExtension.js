_.mixin({
    isArrayLike: function (obj) {
        if (_.isNull(obj) || _.isUndefined(obj)) {
            return false;
        }
        var len = obj.length;
        return _.isNumber(len);
    }
});