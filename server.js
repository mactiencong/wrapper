var express = require("express");
var session = require("express-session");
var app = express();
var ejs = require("ejs");
var bodyParser = require("body-parser");
var api = require("./api/api.js");
var CONFIG = require("./config.json");
// config
var SERVER_PORT = CONFIG.server.port;
// end
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set("view engine", "ejs");
app.use(express.static(__dirname + '/admin/statics'));
app.use(express.static(__dirname + '/landing'));
app.set('views',__dirname + "/admin");
app.use(session({
  secret: 'wrapper',
  resave: false,
  saveUninitialized: true,
//   cookie: { secure: true }
}))
app.post("/login",(req, res)=>{
    api.login(req, res);
})
app.post("/action",(req, res)=>{
    api.action(req, res);
})
app.post("/register",(req, res)=>{
    api.register(req, res);
})
app.get("/report",(req, res)=>{
    api.report(req, res, (result)=>{
        console.log("report result: ", result);
        return res.send("result");
    });
})
app.get("/publisher/index", (req, res)=>{
    console.log("/publisher/index");
    api.check_login(req, res, (publisher)=>{
        console.log("session in /publisher/index", publisher);
        if(!publisher) return res.redirect("/publisher/login");
        api.report(req, res, (result, paging)=>{
            return res.render("index", {"publisher": publisher, "report": result, "filter": req.query, "paging": paging});
        })
    });
    console.log("/publisher/index checking session");
})
app.get("/publisher/login", (req, res)=>{
    console.log("/publisher/login");
    api.check_login(req, res, (publisher)=>{
        console.log("session in /publisher/login", req.session.publisher);
        if(publisher) return res.redirect("/publisher/index");
        else return res.render("login", {"code": req.query.code});
    });
    console.log("/publisher/login checking session");
})
app.post("/publisher/login", (req, res)=>{
    api.publisher_login(req, res, (publisher)=>{
        console.log("session after login", publisher);
        if(publisher) return res.redirect("/publisher/index");
        else return res.redirect("/publisher/login?code=1004");
    });
    console.log("post /publisher/login login ...");
})
app.get("/publisher/logout", (req, res)=>{
    api.publisher_logout(req, res, ()=>{
        res.redirect("/publisher/login");
    });
})
app.get("/landing", (req, res)=>{
    res.sendFile(__dirname + '/landing/index.html');
})
app.post("/publisher/signup", (req, res)=>{
    api.publisher_signup(req, res, (status)=>{
        var code = status?"1002":"1003"; // 1002 - success, 1003 - fail
        return res.redirect("/publisher/login?code="+code);
    });
})
app.get('*', (req, res)=>{
  return res.redirect("/landing");
});
app.locals.parse_msg = code=>{
    if(code==="1004") return "Login failed!";
    if(code==="1002") return "Register successfully!";
    if(code==="1003") return "Register failed! Please, try with other email";
    return "Welcome to bypassfirewall";
};
api.init(()=>{
    app.listen(SERVER_PORT);
    console.log("Server started on port: " + SERVER_PORT);
})