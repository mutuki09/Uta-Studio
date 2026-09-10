/* Generated private-local loader. The encoded bank never leaves this device. */
(function () {
  var cached = null;
  var loading = null;
  var expectedBytes = 32319396;
  window.UTA_GENKO_BUILTIN_SOUNDFONT = {
    name: "GeneralUser GS 2.0.3",
    bytes: expectedBytes,
    load: function () {
      if (cached) return Promise.resolve(cached);
      if (loading) return loading;
      loading = new Promise(function (resolve, reject) {
        var chunks = window.UTA_GENKO_SOUNDFONT_CHUNKS || [];
        var output = new Uint8Array(expectedBytes);
        var chunkIndex = 0, offset = 0;
        function decodeNext() {
          try {
            if (chunkIndex >= chunks.length) {
              if (offset !== expectedBytes) throw new Error("Built-in SoundFont length mismatch");
              cached = output.buffer;
              window.UTA_GENKO_SOUNDFONT_CHUNKS = [];
              resolve(cached);
              return;
            }
            var binary = atob(chunks[chunkIndex]);
            for (var i = 0; i < binary.length; i++) output[offset + i] = binary.charCodeAt(i);
            offset += binary.length;
            chunks[chunkIndex] = "";
            chunkIndex++;
            setTimeout(decodeNext, 0);
          } catch (error) { reject(error); }
        }
        decodeNext();
      });
      return loading;
    }
  };
})();
