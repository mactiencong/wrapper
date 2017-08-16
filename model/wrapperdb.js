var CONFIG = require("../config.json");
var mongoClient = require("mongodb").MongoClient;
var MONGO_DB_URL = CONFIG.db.mongo_db_url;
var mongodb = null;
function connect(callback){
    if(!mongodb) mongoClient.connect(MONGO_DB_URL, (err, db)=>{
        if(err) return console.log("MongoDB error: " + err);
        mongodb = db;
        console.log("MongoDB: connect successfully");
        callback();
    });
}
function login(username, password, callback){
    mongodb.collection("publisher").findOne({"publisher":username, "password":password}, {"password":0, "_id": 0}, (err, publisher)=> {
        if(err) console.log(err);
        callback(err, publisher);
    });
}
function getCurrentBalance(publisher, callback){
    mongodb.collection("publisher").findOne({"publisher":publisher}, {"password":0, "_id": 0}, (err, publisher)=> {
        if(err) console.log(err);
        callback(err, publisher.current_balance);
    });
}
function action(history_data, callback) {
    mongodb.collection("history").insert(history_data, (err, result)=>{
        if(err) console.log(err);
        callback(err, result);
    });
}
function increaseTotalAmount(publisher, callback) {
    mongodb.collection("publisher").update(
        {publisher: publisher},
        {$inc: {current_balance: CONFIG.revenue_per_open_app}},
        (err, result)=>{
            if(err) console.log(err);
            callback(err, result);
        }
    );
}
function resetTotalAmountAfterWidthrawling(publisher, callback){
    mongodb.collection("publisher").update(
        {publisher: publisher},
        {$set: {current_balance: 0}},
        (err, result)=>{
            if(err) console.log(err);
            callback(err, result);
        }
    );
}
function register(username, password, callback){
    var token = generateToken();
    mongodb.collection("publisher").insert({"publisher": username, "password": password, "token": token}, (err, result)=>{
        if(err) {
            console.log(err);
            return callback(err, null);
        }
        return callback(err, token);
    })
}
function updateWithdrawalEmail(publisher, withdrawalEmail, callback){
    mongodb.collection("publisher").update(
        {publisher: publisher},
        {$set: {withdrawal_email: withdrawalEmail}},
        (err, result)=>{
            if(err) console.log(err);
            callback(err, result);
        }
    );
}
function save_message(email, message, callback) {
    mongodb.collection("message").insert({"email": email, "message": message}, (err, result)=>{
       return err?callback(false):callback(true);
    })
}

function report(conditions, callback){
    var publisher = conditions.publisher;
    var udid = conditions.udid;
    var package_name = conditions.package_name;
    var from_date = get_date_from_string(conditions.from_date);
    var to_date = get_date_from_string(conditions.to_date, true);
    var page = conditions.page;
    var limit = CONFIG.api.report.limit;
    var aggregate = [
        {
            $match: {}
        },
        {
            $group: {
                _id: {
                    year: { $year: "$time" },
                    month: { $month: "$time" },
                    day: { $dayOfMonth: "$time" },
                },
                open_app: {$sum:1},
                revenue: {$sum:"$revenue"}
            }
        },
        {$limit: limit},
        {$skip: limit * (page-1)}
    ];
    if(JSON.stringify(aggregate[0].$match._id)==="{}") delete aggregate[0].$match._id;
    if(publisher) aggregate[0].$match.publisher = publisher;
    if(udid) aggregate[0].$match.udid = udid;
    if(package_name) aggregate[0].$match.package_name = {'$regex': package_name};
    aggregate[0].$match.time = {};
    if(from_date) aggregate[0].$match.time.$gte = from_date;
    if(to_date) aggregate[0].$match.time.$lte = to_date;
    console.log(aggregate[0].$match.time);
    if(JSON.stringify(aggregate[0].$match.time)==="{}") delete aggregate[0].$match.time;
    console.log("report aggregate: ", aggregate);
    mongodb.collection("history").aggregate(aggregate).toArray((err, result)=>{
        if(err) {
            console.log(err);
            return callback(false);
        }
        return callback(result);
    });
}

function get_date_from_string(str, is_last_time_of_day=false){
    if(!str) return false;
    var date = new Date(str+(is_last_time_of_day?'T24:00:00.000Z':'T00:00:00.000Z'));
    return (date instanceof Date && !isNaN(date.valueOf()))?date:false;
}

function get_publisher_by_token(token) {
    return new Promise((resolve, reject)=>{
        mongodb.collection("publisher").findOne({"token":token}, (err, publisher)=> {
            if(err) reject(err);
            if(publisher) resolve(publisher.publisher);
            else reject("PUBLISHER_INVALID");
        });
    })
}

function generateToken(){
    return makeid();
}
function makeid() {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (var i = 0; i < 64; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));

  return text;
}
module.exports.connect = connect;
module.exports.login = login;
module.exports.register = register;
module.exports.action = action;
module.exports.report = report;
module.exports.get_publisher_by_token = get_publisher_by_token;
module.exports.save_message = save_message;
module.exports.increaseTotalAmount = increaseTotalAmount;
module.exports.resetTotalAmountAfterWidthrawling = resetTotalAmountAfterWidthrawling;
module.exports.updateWithdrawalEmail = updateWithdrawalEmail;
module.exports.getCurrentBalance = getCurrentBalance;