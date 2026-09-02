module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: "./android",
        packageImportPath: "import com.htyfmp.airhoptransport.AirhopTransportPackage;",
        packageInstance: "new AirhopTransportPackage()",
      },
      ios: { podspecPath: "./AirhopTransport.podspec" },
    },
  },
};
