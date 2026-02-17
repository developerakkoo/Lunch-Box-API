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
            email: { type: "string", example: "rahul@example.com" }
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
