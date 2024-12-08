module.exports = {
  apps : [{
    name   : "bot",
    script : "./dist/main.js",
    exp_backoff_restart_delay: 100,
  }]
}
