import gulp from 'gulp';
import Stubon from './index';
gulp.task('stubon', () => {
    var stubon = new Stubon('./test/sample', {
        debug : true,
        ssl   : true,
    });
    return stubon.server().listen(8080);
});
