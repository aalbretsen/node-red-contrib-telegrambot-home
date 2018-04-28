var utils = require('../../lib/utils.js');

module.exports = function(RED) {
  function buildArgs(node, payload, ...keys) {
    var values = [];
    var n = keys.length;

    for (var i = 0; i < n; i++) {
      values.push(payload[keys[i]]);
      delete payload[keys[i]];
    }

    return [node.chatId, ...values, payload];
  }

  function PayloadNode(config) {
    RED.nodes.createNode(this, config);
    var node = this;

    // Get base configuration
    this.bot = RED.nodes.getNode(config.bot);
    this.chatId = parseInt(config.chatId);
    this.sendMethod = config.sendMethod;
    this.staticPayload = config.payload;

    // Initialize bot
    utils.initializeBot(node);

    // Verify inputs
    if (!this.chatId || isNaN(this.chatId)) {
      utils.updateNodeStatusFailed(node, "chat ID not provided");
    }

    if (!this.sendMethod) {
      utils.updateNodeStatusFailed(node, "sendMethod not provided");
    } else if (typeof node.telegramBot[this.sendMethod] !== "function") {
      utils.updateNodeStatusFailed(node, `sendMethod '${this.sendMethod}' is not supported`);
      this.sendMethod = null;
    }

    if (this.staticPayload && typeof this.staticPayload !== "object") {
      try {
        this.staticPayload = JSON.parse(this.staticPayload);
      } catch(ex) {
        utils.updateNodeStatusFailed(node, "staticPayload is not valid JSON");
        node.warn(ex.message);
      }
    }

    this.on("input", function(msg){
      if (!(node.staticPayload || msg.payload)) {
        utils.updateNodeStatusFailed(node, "message payload is empty");
      } else if (!node.chatId) {
        utils.updateNodeStatusFailed(node, "chat ID is empty");
      } else if (!node.sendMethod) {
        utils.updateNodeStatusFailed(node, "sendMethod is empty or not supported");
      } else {
        var payload = node.staticPayload;
        var args = [];

        if (!payload && msg.payload) {
          if (typeof msg.payload === "string") {
            try {
              payload = JSON.parse(msg.payload);
            } catch(ex) {
              utils.updateNodeStatusFailed(node, "payload is malformed");
              node.warn(ex.message);
            }
          } else if (typeof msg.payload === "object") {
            payload = msg.payload;
          } else {
            utils.updateNodeStatusFailed(node, "payload is malformed");
            node.warn(`expected payload to be string or object, got ${typeof msg.payload}`);
          }
        }

        switch(node.sendMethod) {
          case "sendMessage":    args = buildArgs(node, payload, "text"); break;
          case "sendPhoto":      args = buildArgs(node, payload, "photo"); break;
          case "sendAudio":      args = buildArgs(node, payload, "audio"); break;
          case "sendDocument":   args = buildArgs(node, payload, "document"); break;
          case "sendSticker":    args = buildArgs(node, payload, "sticker"); break;
          case "sendVideo":      args = buildArgs(node, payload, "video"); break;
          case "sendVoice":      args = buildArgs(node, payload, "voice"); break;
          case "sendVideoNote":  args = buildArgs(node, payload, "video_note"); break;
          case "sendMediaGroup": args = buildArgs(node, payload, "media"); break;
          case "sendLocation":   args = buildArgs(node, payload, "latitude", "longitude"); break;
          case "sendVenue":      args = buildArgs(node, payload, "latitude", "longitude", "title", "address"); break;
          case "sendContact":    args = buildArgs(node, payload, "phone_number", "first_name"); break;
          case "sendChatAction": args = buildArgs(node, payload, "chat_action"); break;

          case "answerCallbackQuery": args = buildArgs(node, payload, "callback_query_id"); break;
          case "editMessageReplyMarkup": args = buildArgs(node, payload, "reply_markup"); break;
        }

        if (args.length > 0) {
          node.telegramBot[node.sendMethod](...args).then(function(response){
            msg.payload = response;
            node.send(msg);
          });
        } else {
          node.warn("empty arguments after parsing payload");
        }
      }
    });

    this.on("close", function(){
      node.telegramBot.off("message");
      node.status({});
    });
  }

  RED.nodes.registerType("telegrambot-payload", PayloadNode);
};