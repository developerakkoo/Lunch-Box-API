const swaggerJSDoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Lunch Box API",
      version: "1.0.0",
      description: "Lunch Box Backend API Documentation",
    },

    servers: [
      {
        url: `http://localhost:${process.env.PORT || 8000}`,
      },
    ],

    components: {

      /* ================= SECURITY ================= */

      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },

      schemas: {

        /* ================= ADMIN ================= */

        AdminRegisterRequest: {
          type: "object",
          required: ["name", "email", "password"],
          properties: {
            name: { type: "string", example: "Super Admin" },
            email: { type: "string", example: "admin@eatepic.com" },
            password: { type: "string", example: "123456" }
          }
        },

        AdminLoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", example: "admin@eatepic.com" },
            password: { type: "string", example: "123456" }
          }
        },



        /* ================= DRIVER ================= */

        DriverRegisterRequest: {
          type: "object",
          required: ["fullName", "email", "password", "mobileNumber", "address"],
          properties: {
            fullName: { type: "string", example: "Driver Rahul" },
            email: { type: "string", example: "driver@gmail.com" },
            password: { type: "string", example: "123456" },
            mobileNumber: { type: "string", example: "9876543210" },
            address: { type: "string", example: "Pune" }
          }
        },

        DriverLoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", example: "driver@gmail.com" },
            password: { type: "string", example: "123456" }
          }
        },

        DriverProfileUpdateRequest: {
          type: "object",
          properties: {
            fullName: { type: "string", example: "Driver Rahul" },
            mobileNumber: { type: "string", example: "9876543210" },
            address: { type: "string", example: "Pune" },
            profileImage: { type: "string", example: "https://example.com/driver.jpg" },
            vehicle: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["BIKE", "SCOOTER", "BICYCLE", "CAR"] },
                vehicleNumber: { type: "string", example: "MH12AB1234" },
                model: { type: "string", example: "Activa 6G" },
                color: { type: "string", example: "Black" }
              }
            },
            documents: {
              type: "object",
              properties: {
                licenseNumber: { type: "string", example: "DL-12345678" },
                aadhaarNumber: { type: "string", example: "123412341234" },
                panNumber: { type: "string", example: "ABCDE1234F" }
              }
            }
          }
        },

        DriverAvailabilityRequest: {
          type: "object",
          required: ["status"],
          properties: {
            status: { type: "string", enum: ["ACTIVE", "INACTIVE"], example: "ACTIVE" }
          }
        },


        /* ================= PARTNER ================= */

        PartnerRegisterRequest: {
          type: "object",
          properties: {
            kitchenName: { type: "string", example: "Spicy House" },
            ownerName: { type: "string", example: "Rahul" },
            email: { type: "string", example: "rahul@gmail.com" },
            password: { type: "string", example: "123456" }
          }
        },

        PartnerLoginRequest: {
          type: "object",
          properties: {
            email: { type: "string", example: "rahul@gmail.com" },
            password: { type: "string", example: "123456" }
          }
        },

        PartnerProfileUpdateRequest: {
          type: "object",
          properties: {
            kitchenName: { type: "string", example: "Spicy House" },
            ownerName: { type: "string", example: "Rahul" },
            phone: { type: "string", example: "9876543210" },
            address: { type: "string", example: "Pune, Maharashtra" },
            latitude: { type: "number", example: 18.5204 },
            longitude: { type: "number", example: 73.8567 }
          }
        },


        /* ================= CATEGORY ================= */

        CategoryCreateRequest: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", example: "Main Course" },
            description: { type: "string", example: "Lunch items" },
            image: { type: "string", example: "" }
          }
        },


        /* ================= MENU ================= */

        MenuCreateRequest: {
          type: "object",
          required: ["name", "price", "category"],
          properties: {
            name: { type: "string", example: "Paneer Butter Masala" },
            description: { type: "string", example: "Creamy Paneer Dish" },
            price: { type: "number", example: 220 },
            isVeg: { type: "boolean", example: true },
            category: { type: "string", example: "categoryId" }
          }
        },


        /* ================= ADDON CATEGORY ================= */

        AddonCategoryCreateRequest: {
          type: "object",
          required: ["name", "menuItem"],
          properties: {
            name: { type: "string", example: "Extra Toppings" },
            isRequired: { type: "boolean", example: false },
            maxSelection: { type: "number", example: 4 },
            menuItem: { type: "string", example: "menuItemId" }
          }
        },


        /* ================= ADDON ITEM ================= */

        AddonItemCreateRequest: {
          type: "object",
          required: ["name", "price", "addonCategory"],
          properties: {
            name: { type: "string", example: "Extra Cheese" },
            price: { type: "number", example: 30 },
            addonCategory: { type: "string", example: "addonCategoryId" }
          }
        },

        /* ================= USER ================= */

        UserLoginRequest: {
          type: "object",
          required: ["mobileNumber"],
          properties: {
            countryCode: { type: "string", example: "+91" },
            mobileNumber: { type: "string", example: "9876543210" },
            fullName: { type: "string", example: "Rahul Sharma" },
            email: { type: "string", example: "rahul@example.com" },
            referralCode: { type: "string", example: "RAHU12AB" }
          }
        },

        UserAddressCreateRequest: {
          type: "object",
          required: ["fullAddress"],
          properties: {
            label: { type: "string", example: "Home" },
            fullAddress: { type: "string", example: "MG Road, Pune" },
            city: { type: "string", example: "Pune" },
            state: { type: "string", example: "Maharashtra" },
            pincode: { type: "string", example: "411001" },
            latitude: { type: "number", example: 18.5204 },
            longitude: { type: "number", example: 73.8567 },
            isDefault: { type: "boolean", example: true }
          }
        },

        UserAddressUpdateRequest: {
          type: "object",
          properties: {
            label: { type: "string", example: "Office" },
            fullAddress: { type: "string", example: "Baner Road, Pune" },
            city: { type: "string", example: "Pune" },
            state: { type: "string", example: "Maharashtra" },
            pincode: { type: "string", example: "411045" },
            latitude: { type: "number", example: 18.5679 },
            longitude: { type: "number", example: 73.9143 },
            isDefault: { type: "boolean", example: false }
          }
        },

        UserProfileUpdateRequest: {
          type: "object",
          properties: {
            fullName: { type: "string", example: "Rahul Sharma" },
            email: { type: "string", example: "rahul@example.com" },
            profileImage: { type: "string", example: "https://example.com/profile.jpg" },
            preferredLanguage: { type: "string", example: "en" },
            textDirection: { type: "string", enum: ["LTR", "RTL"], example: "LTR" }
          }
        },

        /* ================= CART ================= */

        CartAddRequest: {
          type: "object",
          required: ["menuItemId"],
          properties: {
            menuItemId: { type: "string", example: "66ff1b2c3d4e5f6789012345" },
            quantity: { type: "number", example: 2 }
          }
        },

        /* ================= ORDER ================= */

        OrderCreateRequest: {
          type: "object",
          required: ["addressId"],
          properties: {
            addressId: { type: "string", example: "66ff1b2c3d4e5f6789011111" },
            paymentMethod: {
              type: "string",
              enum: ["COD", "ONLINE", "WALLET"],
              example: "COD"
            }
          }
        },

        KitchenActionRequest: {
          type: "object",
          required: ["action"],
          properties: {
            action: {
              type: "string",
              enum: ["ACCEPT", "REJECT"],
              example: "ACCEPT"
            }
          }
        },

        ConfirmPaymentRequest: {
          type: "object",
          required: ["orderId", "razorpay_payment_id", "razorpay_order_id", "razorpay_signature"],
          properties: {
            orderId: { type: "string", example: "66ff1b2c3d4e5f6789019999" },
            razorpay_payment_id: { type: "string", example: "pay_Nw6..." },
            razorpay_order_id: { type: "string", example: "order_Nw6..." },
            razorpay_signature: { type: "string", example: "b1946ac92492d2347c6235b4d2611184" }
          }
        },

        OrderCancelRequest: {
          type: "object",
          properties: {
            reason: { type: "string", example: "Change of plans" }
          }
        },

        WalletTopupCreateRequest: {
          type: "object",
          required: ["amount", "gateway"],
          properties: {
            amount: { type: "number", example: 500 },
            gateway: { type: "string", enum: ["RAZORPAY", "STRIPE"], example: "RAZORPAY" }
          }
        },

        WalletTopupConfirmRequest: {
          type: "object",
          required: ["gateway"],
          properties: {
            gateway: { type: "string", enum: ["RAZORPAY", "STRIPE"], example: "RAZORPAY" },
            razorpay_payment_id: { type: "string", example: "pay_xxx" },
            razorpay_order_id: { type: "string", example: "order_xxx" },
            razorpay_signature: { type: "string", example: "signature_xxx" },
            stripe_payment_intent_id: { type: "string", example: "pi_xxx" }
          }
        },

        ApplyReferralRequest: {
          type: "object",
          required: ["referralCode"],
          properties: {
            referralCode: { type: "string", example: "RAHU12AB" }
          }
        },

        SubscriptionPurchaseRequest: {
          type: "object",
          required: ["planId", "paymentMethod"],
          properties: {
            planId: { type: "string", example: "66ff1b2c3d4e5f678901aaaa" },
            startDate: { type: "string", format: "date-time", example: "2026-02-20T00:00:00.000Z" },
            paymentMethod: { type: "string", enum: ["WALLET", "RAZORPAY", "STRIPE"], example: "WALLET" }
          }
        },

        SubscriptionPaymentConfirmRequest: {
          type: "object",
          required: ["gateway"],
          properties: {
            gateway: { type: "string", enum: ["RAZORPAY", "STRIPE"], example: "RAZORPAY" },
            razorpay_payment_id: { type: "string", example: "pay_xxx" },
            razorpay_order_id: { type: "string", example: "order_xxx" },
            razorpay_signature: { type: "string", example: "signature_xxx" },
            stripe_payment_intent_id: { type: "string", example: "pi_xxx" }
          }
        },

        OrderRatingRequest: {
          type: "object",
          properties: {
            partnerRating: { type: "number", example: 5 },
            deliveryRating: { type: "number", example: 4 },
            review: { type: "string", example: "Great food and on-time delivery." }
          }
        },

        OrderTipRequest: {
          type: "object",
          required: ["amount", "paymentMethod"],
          properties: {
            amount: { type: "number", example: 30 },
            paymentMethod: { type: "string", enum: ["WALLET", "RAZORPAY", "STRIPE"], example: "WALLET" }
          }
        },

        TipPaymentConfirmRequest: {
          type: "object",
          required: ["gateway"],
          properties: {
            gateway: { type: "string", enum: ["RAZORPAY", "STRIPE"], example: "RAZORPAY" },
            razorpay_payment_id: { type: "string", example: "pay_xxx" },
            razorpay_order_id: { type: "string", example: "order_xxx" },
            razorpay_signature: { type: "string", example: "signature_xxx" },
            stripe_payment_intent_id: { type: "string", example: "pi_xxx" }
          }
        }

      },
    },
  },

  /* ================= ROUTE FILE PATHS ================= */

  apis: [
    "./src/routes/*.js",
    "./src/routes/admin/*.js" // ⭐ IMPORTANT FOR ADMIN
  ],
};

module.exports = swaggerJSDoc(options);
