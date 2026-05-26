class OtpProviderAdapter {
  async sendOtp() {
    throw new Error("TODO: implement sendOtp in provider adapter.");
  }

  async verifyOtp() {
    throw new Error("TODO: implement verifyOtp in provider adapter.");
  }
}

module.exports = { OtpProviderAdapter };
