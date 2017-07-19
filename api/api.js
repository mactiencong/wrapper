var wrapper_db = require("../model/wrapperdb.js");
var crypto = require('crypto');
var CONFIG = require("../config.json");
var NodeCache = require("node-cache");
var caching = null;
// config
var S_TOKEN = CONFIG.api.secure_token;
// end
var API= {
    init: (callback)=>{
        wrapper_db.connect(callback);
        caching = new NodeCache();
    },
    login: (req, res) => {
        var username = req.body.username || null;
        var password = req.body.password || null;
        wrapper_db.login(username, password, (err, publisher)=>{
            return err?API.api_response(res, false, err):API.api_response(res, true, null, publisher);
        })
    },
    caching_get_key: (req_data)=>{
        return crypto.createHash('sha256').update("wrapper"+req_data.token+req_data.package_name+req_data.udid).digest("hex");
    },
    caching_get: (req_data, callback)=> {
        console.log("get cache");
        caching.get(API.caching_get_key(req_data), (err, value)=>{
            return err || value===undefined? callback(false):callback(value);
        })
    },
    caching_set: (req_data, data, ttl, callback)=> {
        console.log("set cache");
        caching.set(API.caching_get_key(req_data), data, ttl, (err, success)=>{
            return !err && success? callback(true):callback(false);
        })
    },
    action: (req, res) => {
        API.caching_get(req.body, (value)=>{
            if(value) return API.api_response(res, false, "REQUEST_REJECTED", null);
            if(!API.validate_signature(req.body)) return API.api_response(res, false, "SIGNATURE_INVALID", null);
            var action_data = API.normal_action_data(req);
            console.log(action_data);
            API.caching_set(req.body, "1", CONFIG.caching.action_ttl, (status)=>{});
            API.get_publisher_by_token(action_data.token)
            .then(publisher=>{return API.log_history(res, publisher, action_data)}, err=>{ return API.api_response(res, false, err, null)})
        });
    },
    log_history: (res, publisher, action_data)=> {
        action_data.publisher = publisher;
        console.log("publisher", publisher);
        wrapper_db.action(action_data, (err, result)=> {
            delete action_data._id, action_data.publisher, action_data.revenue, action_data.udid; // dont response these
            return err ? API.api_response(res, false, "DB_ERROR", null) : API.api_response(res, true, null, action_data);
        })
    },
    normal_action_data: (req) => {
        var action_data = req.body;
        action_data.time = new Date();
        var client_info = API.get_client_info(req);
        action_data.ip = client_info.ip;
        action_data.user_agent = client_info.user_agent;
        action_data.revenue = API.calc_revenue_open_app();
        return action_data;
    },
    get_publisher_by_token: (token)=>{
        return wrapper_db.get_publisher_by_token(token);
    },
    calc_revenue_open_app: ()=>{
        return CONFIG.revenue_per_open_app;
    },
    register: (req, res)=>{
        var username = req.body.username || null;
        var password = req.body.password || null;
        wrapper_db.register(username, password, (err, token)=> {
            return !err ? API.api_response(res, true, null, {"token": token}) : API.api_response(res, false, "DB_ERROR", null);
        })
    },
    publisher_login: (req, res, callback)=>{
        console.log(req.body);
        var username = req.body.username || null;
        var password = req.body.password || null;
        wrapper_db.login(username, password, (err, publisher)=>{
            if(err || !publisher) return callback(false);
            req.session.publisher = publisher;
            console.log("saved session", req.session.publisher);
            return req.session.save(err=> {
                if(err) {
                    req.session.publisher = null;
                    return callback(false);
                }
                else return callback(publisher);
            });
        })
    },
    publisher_signup: (req, res, callback)=>{
        var username = req.body.email || null;
        var password = req.body.password || null;
        wrapper_db.register(username, password, (err, token)=> {
            return err?callback(false):callback(true);
        })
    },
    get_login_publisher: ()=>{
        return req.session.publisher;
    },
    check_login : (req, res, callback) => {
        console.log("session check login:", req.session.publisher);
        if(req.session.publisher) return callback(req.session.publisher);
        return callback(false);
    },
    publisher_logout: (req, res, callback) => {
        return req.session.destroy(callback);
    },
    validate_signature: (params) => {
        return true;
        var params_str = S_TOKEN;
        var req_signature = params["signature"]||null;
        delete params["signature"];
        for(key in params) params_str += params[key];
        var server_signature = crypto.createHash('sha256').update(params_str).digest("hex");
        return server_signature===req_signature;
    },
    api_response: (res, is_success, error=null, data=null) => {
        console.log("API response");
        return res.send({"status":(is_success?1:0), "error":(error?error:""), "data":(data?data:null)});
    },
    get_client_info: (req)=>{
        return client_info = {
            ip: req.headers['x-forwarded-for'] || 
                req.connection.remoteAddress || 
                req.socket.remoteAddress ||
                req.connection.socket.remoteAddress,
            user_agent: req.headers['user-agent']
        }
    },
    report: (req, res, callback)=>{
         var conditions = req.query;
         console.log(req.query);
         conditions = API.normal_conditions_report(req, conditions);
         console.log("condition after normaling: ", conditions);
         console.log(req.query);
         wrapper_db.report(conditions, result=> {
            return callback(result, API.report_paging(result.length, conditions.page));
        })
    },
    normal_conditions_report: (req, conditions)=>{
        conditions.publisher = req.session.publisher.publisher; // always filter by publisher
        var page = parseInt(conditions.page);
        conditions.page = !isNaN(page)&&page>0?page:1;
        if(!API.is_valid_date_string(conditions.from_date) && !API.is_valid_date_string(conditions.to_date)){
            var default_date = API.get_start_and_haft_current_month();
            conditions.from_date = default_date.start;
            conditions.to_date = default_date.haft;
        }
        return conditions;
    },
    is_valid_date_string:(date_str)=>{
        if(!date_str) return false;
        var date = new Date(date_str);
        return (date instanceof Date && !isNaN(date.valueOf()))?true:false;
    },
    report_paging: (result_length, current_page) => {
        return {
            next: result_length===CONFIG.api.report.limit?current_page+1:false,
            previous: current_page>1?current_page-1:false
        };
    },
    get_start_and_haft_current_month: ()=> {
        var date = new Date();
        var month = date.getMonth() + 1;
        return {
            start: date.getFullYear()+"-"+month+"-01",
            haft: date.getFullYear()+"-"+month+"-15"
        };
    }
}
module.exports.login = API.login;
module.exports.register = API.register;
module.exports.action = API.action;
module.exports.init = API.init;
module.exports.publisher_login = API.publisher_login;
module.exports.publisher_signup = API.publisher_signup;
module.exports.check_login = API.check_login;
module.exports.publisher_logout = API.publisher_logout;
module.exports.report = API.report;