export interface GoogleBusinessAccount {
  name: string;
  accountName?: string;
  type?: string;
  verificationState?: string;
  vettedState?: string;
}

export interface GoogleBusinessLocation {
  name: string;
  title?: string;
  storefrontAddress?: Record<string, any>;
  metadata?: Record<string, any>;
  phoneNumbers?: Record<string, any>;
  websiteUri?: string;
}

export interface GoogleBusinessReview {
  reviewId?: string;
  reviewer?: Record<string, any>;
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: Record<string, any>;
}

export interface SelectGoogleBusinessLocationDto {
  accountName: string;
  locationName: string;
  displayName?: string;
}
