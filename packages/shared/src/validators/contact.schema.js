"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateContactSchema = exports.CreateContactSchema = void 0;
const zod_1 = require("zod");
exports.CreateContactSchema = zod_1.z.object({
    phoneNumber: zod_1.z.string().min(7).max(20),
    displayName: zod_1.z.string().max(100).optional(),
    firstName: zod_1.z.string().max(50).optional(),
    lastName: zod_1.z.string().max(50).optional(),
    email: zod_1.z.string().email().optional(),
    tags: zod_1.z.array(zod_1.z.string().max(50)).max(20).default([]),
    customFields: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).default({}),
    notes: zod_1.z.string().max(2000).optional(),
});
exports.UpdateContactSchema = exports.CreateContactSchema.partial();
//# sourceMappingURL=contact.schema.js.map