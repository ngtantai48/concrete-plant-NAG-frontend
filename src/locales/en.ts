const en = {
  signIn: {
    username: "Username",
    bigSlogan: "Welcome to NGUYÊN ANH GROUP!",
    slogan: "Please sign-in to your account",
    password: "Password",
    rememberMe: "Remember me",
    signIn: "Login",
    or: "or",
    validation: {
      required: "is required",
      invalid: "Input field is not valid",
    },
    placeholder: {
      password: "**********",
    },
    forget: "Forgot your password?",
    get: "Change your password",
  },
  errors: {
    "ERR_AUTH::ALREADY_LOGIN": "Account logged in on another device.",
    "ERR_AUTH::INVALID_CREDENTIALS": "Invalid username or password.",
    "ERR_COMMON::MISSING_INPUT_DATA": "Username must be at least 3 characters.\nPassword must be at least 6 characters.",
    "ERR_COMMON::USERNAME_TOO_SHORT": "Username must be at least 3 characters.",
    "ERR_COMMON::PASSWORD_TOO_SHORT": "Password must be at least 6 characters.",
  } as Record<string, string>,
};

export default en;
