( function () {

	var ReflectorForSSRPass = function ( geometry, options ) {

		THREE.Mesh.call( this, geometry );
		this.type = 'ReflectorForSSRPass';
		var scope = this;
		options = options || {};
		var color = options.color !== undefined ? new THREE.Color( options.color ) : new THREE.Color( 0x7F7F7F );
		var textureWidth = options.textureWidth || 512;
		var textureHeight = options.textureHeight || 512;
		var clipBias = options.clipBias || 0;
		var shader = options.shader || ReflectorForSSRPass.ReflectorShader;
		var useDepthTexture = options.useDepthTexture === true;
		var yAxis = new THREE.Vector3( 0, 1, 0 );
		var vecTemp0 = new THREE.Vector3();
		var vecTemp1 = new THREE.Vector3(); //

		scope.needsUpdate = false;
		scope.maxDistance = ReflectorForSSRPass.ReflectorShader.uniforms.maxDistance.value;
		scope.opacity = ReflectorForSSRPass.ReflectorShader.uniforms.opacity.value;
		scope.color = color;
		scope.resolution = options.resolution || new THREE.Vector2( window.innerWidth, window.innerHeight );
		scope._distanceAttenuation = ReflectorForSSRPass.ReflectorShader.defines.DISTANCE_ATTENUATION;
		Object.defineProperty( scope, 'distanceAttenuation', {
			get() {

				return scope._distanceAttenuation;

			},

			set( val ) {

				if ( scope._distanceAttenuation === val ) return;
				scope._distanceAttenuation = val;
				scope.material.defines.DISTANCE_ATTENUATION = val;
				scope.material.needsUpdate = true;

			}

		} );
		scope._fresnel = ReflectorForSSRPass.ReflectorShader.defines.FRESNEL;
		Object.defineProperty( scope, 'fresnel', {
			get() {

				return scope._fresnel;

			},

			set( val ) {

				if ( scope._fresnel === val ) return;
				scope._fresnel = val;
				scope.material.defines.FRESNEL = val;
				scope.material.needsUpdate = true;

			}

		} );
		var normal = new THREE.Vector3();
		var reflectorWorldPosition = new THREE.Vector3();
		var cameraWorldPosition = new THREE.Vector3();
		var rotationMatrix = new THREE.Matrix4();
		var lookAtPosition = new THREE.Vector3( 0, 0, - 1 );
		var view = new THREE.Vector3();
		var target = new THREE.Vector3();
		var textureMatrix = new THREE.Matrix4();
		var virtualCamera = new THREE.PerspectiveCamera();

		if ( useDepthTexture ) {

			var depthTexture = new THREE.DepthTexture();
			depthTexture.type = THREE.UnsignedShortType;
			depthTexture.minFilter = THREE.NearestFilter;
			depthTexture.magFilter = THREE.NearestFilter;

		}

		var parameters = {
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter,
			format: THREE.RGBFormat,
			depthTexture: useDepthTexture ? depthTexture : null
		};
		var renderTarget = new THREE.WebGLRenderTarget( textureWidth, textureHeight, parameters );

		if ( ! THREE.MathUtils.isPowerOfTwo( textureWidth ) || ! THREE.MathUtils.isPowerOfTwo( textureHeight ) ) {

			renderTarget.texture.generateMipmaps = false;

		}

		var material = new THREE.ShaderMaterial( {
			transparent: useDepthTexture,
			defines: Object.assign( {}, ReflectorForSSRPass.ReflectorShader.defines, {
				useDepthTexture
			} ),
			uniforms: THREE.UniformsUtils.clone( shader.uniforms ),
			fragmentShader: shader.fragmentShader,
			vertexShader: shader.vertexShader
		} );
		material.uniforms[ 'tDiffuse' ].value = renderTarget.texture;
		material.uniforms[ 'color' ].value = scope.color;
		material.uniforms[ 'textureMatrix' ].value = textureMatrix;

		if ( useDepthTexture ) {

			material.uniforms[ 'tDepth' ].value = renderTarget.depthTexture;

		}

		this.material = material;
		const globalPlane = new THREE.Plane( new THREE.Vector3( 0, 1, 0 ), clipBias );
		const globalPlanes = [ globalPlane ];

		this.doRender = function ( renderer, scene, camera ) {

			material.uniforms[ 'maxDistance' ].value = scope.maxDistance;
			material.uniforms[ 'color' ].value = scope.color;
			material.uniforms[ 'opacity' ].value = scope.opacity;
			vecTemp0.copy( camera.position ).normalize();
			vecTemp1.copy( vecTemp0 ).reflect( yAxis );
			material.uniforms[ 'fresnelCoe' ].value = ( vecTemp0.dot( vecTemp1 ) + 1. ) / 2.; // TODO: Also need to use glsl viewPosition and viewNormal per pixel.

			reflectorWorldPosition.setFromMatrixPosition( scope.matrixWorld );
			cameraWorldPosition.setFromMatrixPosition( camera.matrixWorld );
			rotationMatrix.extractRotation( scope.matrixWorld );
			normal.set( 0, 0, 1 );
			normal.applyMatrix4( rotationMatrix );
			view.subVectors( reflectorWorldPosition, cameraWorldPosition ); // Avoid rendering when reflector is facing away

			if ( view.dot( normal ) > 0 ) return;
			view.reflect( normal ).negate();
			view.add( reflectorWorldPosition );
			rotationMatrix.extractRotation( camera.matrixWorld );
			lookAtPosition.set( 0, 0, - 1 );
			lookAtPosition.applyMatrix4( rotationMatrix );
			lookAtPosition.add( cameraWorldPosition );
			target.subVectors( reflectorWorldPosition, lookAtPosition );
			target.reflect( normal ).negate();
			target.add( reflectorWorldPosition );
			virtualCamera.position.copy( view );
			virtualCamera.up.set( 0, 1, 0 );
			virtualCamera.up.applyMatrix4( rotationMatrix );
			virtualCamera.up.reflect( normal );
			virtualCamera.lookAt( target );
			virtualCamera.far = camera.far; // Used in WebGLBackground

			virtualCamera.updateMatrixWorld();
			virtualCamera.projectionMatrix.copy( camera.projectionMatrix );
			material.uniforms[ 'virtualCameraNear' ].value = camera.near;
			material.uniforms[ 'virtualCameraFar' ].value = camera.far;
			material.uniforms[ 'virtualCameraMatrixWorld' ].value = virtualCamera.matrixWorld;
			material.uniforms[ 'virtualCameraProjectionMatrix' ].value = camera.projectionMatrix;
			material.uniforms[ 'virtualCameraProjectionMatrixInverse' ].value = camera.projectionMatrixInverse;
			material.uniforms[ 'resolution' ].value = scope.resolution; // Update the texture matrix

			textureMatrix.set( 0.5, 0.0, 0.0, 0.5, 0.0, 0.5, 0.0, 0.5, 0.0, 0.0, 0.5, 0.5, 0.0, 0.0, 0.0, 1.0 );
			textureMatrix.multiply( virtualCamera.projectionMatrix );
			textureMatrix.multiply( virtualCamera.matrixWorldInverse );
			textureMatrix.multiply( scope.matrixWorld ); // Render

			renderTarget.texture.encoding = renderer.outputEncoding; // scope.visible = false;

			var currentRenderTarget = renderer.getRenderTarget();
			var currentXrEnabled = renderer.xr.enabled;
			var currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;
			var currentClippingPlanes = renderer.clippingPlanes;
			renderer.xr.enabled = false; // Avoid camera modification

			renderer.shadowMap.autoUpdate = false; // Avoid re-computing shadows

			renderer.clippingPlanes = globalPlanes;
			renderer.setRenderTarget( renderTarget );
			renderer.state.buffers.depth.setMask( true ); // make sure the depth buffer is writable so it can be properly cleared, see #18897

			if ( renderer.autoClear === false ) renderer.clear();
			renderer.render( scene, virtualCamera );
			renderer.xr.enabled = currentXrEnabled;
			renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
			renderer.clippingPlanes = currentClippingPlanes;
			renderer.setRenderTarget( currentRenderTarget ); // Restore viewport

			var viewport = camera.viewport;

			if ( viewport !== undefined ) {

				renderer.state.viewport( viewport );

			} // scope.visible = true;

		};

		this.getRenderTarget = function () {

			return renderTarget;

		};

	};

	ReflectorForSSRPass.prototype = Object.create( THREE.Mesh.prototype );
	ReflectorForSSRPass.prototype.constructor = ReflectorForSSRPass;
	ReflectorForSSRPass.ReflectorShader = {
		defines: {
			DISTANCE_ATTENUATION: true,
			FRESNEL: true
		},
		uniforms: {
			color: {
				value: null
			},
			tDiffuse: {
				value: null
			},
			tDepth: {
				value: null
			},
			textureMatrix: {
				value: new THREE.Matrix4()
			},
			maxDistance: {
				value: 180
			},
			opacity: {
				value: 0.5
			},
			fresnelCoe: {
				value: null
			},
			virtualCameraNear: {
				value: null
			},
			virtualCameraFar: {
				value: null
			},
			virtualCameraProjectionMatrix: {
				value: new THREE.Matrix4()
			},
			virtualCameraMatrixWorld: {
				value: new THREE.Matrix4()
			},
			virtualCameraProjectionMatrixInverse: {
				value: new THREE.Matrix4()
			},
			resolution: {
				value: new THREE.Vector2()
			}
		},
		vertexShader: [ 'uniform mat4 textureMatrix;', 'varying vec4 vUv;', 'void main() {', '	vUv = textureMatrix * vec4( position, 1.0 );', '	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );', '}' ].join( '\n' ),
		fragmentShader: `
		uniform vec3 color;
		uniform sampler2D tDiffuse;
		uniform sampler2D tDepth;
		uniform float maxDistance;
		uniform float opacity;
		uniform float fresnelCoe;
		uniform float virtualCameraNear;
		uniform float virtualCameraFar;
		uniform mat4 virtualCameraProjectionMatrix;
		uniform mat4 virtualCameraProjectionMatrixInverse;
		uniform mat4 virtualCameraMatrixWorld;
		uniform vec2 resolution;
		varying vec4 vUv;
		#include <packing>
		float blendOverlay( float base, float blend ) {
			return( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );
		}
		vec3 blendOverlay( vec3 base, vec3 blend ) {
			return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );
		}
		float getDepth( const in vec2 uv ) {
			return texture2D( tDepth, uv ).x;
		}
		float getViewZ( const in float depth ) {
			return perspectiveDepthToViewZ( depth, virtualCameraNear, virtualCameraFar );
		}
		vec3 getViewPosition( const in vec2 uv, const in float depth/*clip space*/, const in float clipW ) {
			vec4 clipPosition = vec4( ( vec3( uv, depth ) - 0.5 ) * 2.0, 1.0 );//ndc
			clipPosition *= clipW; //clip
			return ( virtualCameraProjectionMatrixInverse * clipPosition ).xyz;//view
		}
		void main() {
			vec4 base = texture2DProj( tDiffuse, vUv );
			#ifdef useDepthTexture
				vec2 uv=(gl_FragCoord.xy-.5)/resolution.xy;
				uv.x=1.-uv.x;
				float depth = texture2DProj( tDepth, vUv ).r;
				float viewZ = getViewZ( depth );
				float clipW = virtualCameraProjectionMatrix[2][3] * viewZ+virtualCameraProjectionMatrix[3][3];
				vec3 viewPosition=getViewPosition( uv, depth, clipW );
				vec3 worldPosition=(virtualCameraMatrixWorld*vec4(viewPosition,1)).xyz;
				if(worldPosition.y>maxDistance) discard;
				float op=opacity;
				#ifdef DISTANCE_ATTENUATION
					float ratio=1.-(worldPosition.y/maxDistance);
					float attenuation=ratio*ratio;
					op=opacity*attenuation;
				#endif
				#ifdef FRESNEL
					op*=fresnelCoe;
				#endif
				gl_FragColor = vec4( blendOverlay( base.rgb, color ), op );
			#else
				gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );
			#endif
		}
	`
	};

	THREE.ReflectorForSSRPass = ReflectorForSSRPass;

} )();
