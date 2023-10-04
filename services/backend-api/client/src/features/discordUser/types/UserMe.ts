import { InferType, bool, object, string } from "yup";

export const UserMeSchema = object({
  id: string().required(),
  email: string(),
  preferences: object({
    alertOnDisabledFeeds: bool().default(false),
  }).default({}),
  subscription: object({
    product: object({
      key: string().required(),
      name: string().required(),
    }).required(),
    status: string().oneOf(["ACTIVE", "CANCELLED", "PAST_DUE", "PAUSED"]).required(),
  }).required(),
});

export type UserMe = InferType<typeof UserMeSchema>;
