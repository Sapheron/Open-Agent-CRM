"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SendMessageSchema = void 0;
const zod_1 = require("zod");
exports.SendMessageSchema = zod_1.z.object({
    conversationId: zod_1.z.string().cuid(),
    body: zod_1.z.string().max(4096).optional(),
    mediaUrl: zod_1.z.string().url().optional(),
    mediaCaption: zod_1.z.string().max(1024).optional(),
}).refine((d) => d.body || d.mediaUrl, {
    message: 'Either body or mediaUrl is required',
});
//# sourceMappingURL=message.schema.js.map