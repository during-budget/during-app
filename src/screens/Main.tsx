import React, {useEffect, useRef, useState} from 'react';
import {
  Alert,
  BackHandler,
  Dimensions,
  Platform,
  StyleSheet,
} from 'react-native';
import {
  BannerAdSize,
  GAMBannerAd,
  TestIds,
} from 'react-native-google-mobile-ads';
import {
  ProductPurchase,
  PurchaseError,
  SubscriptionPurchase,
  clearTransactionIOS,
  endConnection,
  finishTransaction,
  flushFailedPurchasesCachedAsPendingAndroid,
  getProducts,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
} from 'react-native-iap';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import {WebViewNativeEvent} from 'react-native-webview/lib/RNCWebViewNativeComponent';

const Main = () => {
  const webview = useRef<WebView>(null);
  const [navState, setNaveState] = useState<WebViewNativeEvent>();

  const [purchaseUpdate, setPurchaseUpdate] = useState<any>(null);
  const [purchaseError, setPurchaseError] = useState<any>(null);

  const [removeAds, setRemoveAds] = useState(false);

  const unitID =
    Platform.select({
      ios: 'ca-app-pub-7896727622535419/3140414754',
      android: 'ca-app-pub-7896727622535419/9945496251',
    }) || '';

  const adUnitId = __DEV__ ? TestIds.BANNER : unitID;

  useEffect(() => {
    const setPayment = async () => {
      try {
        await initConnection();
        if (Platform.OS === 'android') {
          await flushFailedPurchasesCachedAsPendingAndroid();
        } else {
          await clearTransactionIOS();
        }
      } catch (error) {
        if (error instanceof PurchaseError) {
          console.error(
            'An error happened',
            `[${error.code}]: ${error.message}`,
            error,
          );
        } else {
          console.error('An error happend', 'initConnection', error);
        }
      }

      setPurchaseUpdate(
        purchaseUpdatedListener(
          async (purchase: ProductPurchase | SubscriptionPurchase) => {
            const receipt = purchase.transactionReceipt
              ? purchase.transactionReceipt
              : (purchase as unknown as {originalJson: string}).originalJson;
            if (receipt) {
              try {
                await finishTransaction({purchase});

                webview.current?.postMessage(
                  JSON.stringify({
                    intent: 'payment',
                    content: {
                      payload: purchase,
                      platform: Platform.OS,
                    },
                  }),
                );
              } catch (error) {
                console.error('An error happend', 'finishTransaction', error);
                webview.current?.postMessage(
                  JSON.stringify({
                    intent: 'purchase_error',
                  }),
                );
              }
            }
          },
        ),
      );

      setPurchaseError(
        purchaseErrorListener((error: PurchaseError) => {
          webview.current?.postMessage(
            JSON.stringify({
              intent: 'purchase_error',
              content: {
                code: error.code,
                message: error.message,
              },
            }),
          );
          console.error(
            'An error happened',
            `[${error.code}]: ${error.message}`,
            error,
          );
        }),
      );
    };
    setPayment();

    return () => {
      purchaseUpdate?.remove();
      purchaseError?.remove();

      endConnection();
    };
  }, []);

  useEffect(() => {
    const canGoBack = navState?.canGoBack;

    const onPress = () => {
      if (canGoBack) {
        webview?.current?.goBack();
        return true;
      } else {
        return false;
      }
    };

    BackHandler.addEventListener('hardwareBackPress', onPress);

    return () => {
      BackHandler.removeEventListener('hardwareBackPress', onPress);
    };
  }, [navState?.canGoBack]);

  const handleOnMessage = async (e: any) => {
    const msg = e.nativeEvent.data;
    const obj = JSON.parse(msg);
    switch (obj.intent) {
      case 'ad':
        setRemoveAds(obj.content);
        break;
      case 'payment':
        const id = obj.content;
        const products = await getProducts({skus: [id]});

        try {
          if (products[0]) {
            if (Platform.OS === 'ios') {
              await requestPurchase({sku: products[0].productId});
            } else if (Platform.OS === 'android') {
              await requestPurchase({skus: [products[0].productId]});
            }
          } else {
            throw 'id not exists on product list';
          }
        } catch (error) {
          if (error instanceof PurchaseError) {
            console.error(
              'An error happened',
              `[${error.code}]: ${error.message}`,
              error,
            );
          } else {
            console.error('An error happend', 'requestPurchase', error);
          }
        }
        break;
      case 'test':
        Alert.alert(obj.content);
      default:
        return;
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
        <WebView
          ref={webview}
          source={{uri: 'https://www.during.money'}}
          style={styles.webview}
          onNavigationStateChange={event => setNaveState(event)}
          onLoadEnd={() => {
            webview.current?.postMessage(
              JSON.stringify({
                intent: 'platform',
                content: Platform.OS,
              }),
            );
          }}
          onMessage={handleOnMessage}
        />
        {!removeAds && (
          <GAMBannerAd
            unitId={adUnitId}
            sizes={[BannerAdSize.FULL_BANNER]}
            requestOptions={{
              requestNonPersonalizedAdsOnly: true,
            }}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
};

const deviceHeight = Dimensions.get('window').height;
const deviceWidth = Dimensions.get('window').width;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
    width: deviceWidth,
    height: deviceHeight,
  },
});

export default Main;
